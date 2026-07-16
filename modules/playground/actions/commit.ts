"use server";

import ignore from "ignore";
import {
  findPlaygroundById,
  findPlaygroundWithTemplateFiles,
  updatePlaygroundGithubBaseContent,
} from "@/lib/db/repositories/playgrounds";
import { findAccountByUserIdAndProvider } from "@/lib/db/repositories/accounts";
import { updateTemplateFileContent } from "@/lib/db/repositories/templateFiles";
import { currentUser } from "@/modules/auth/actions";
import type { TemplateFolder } from "../lib/path-to-json";
import { setFileContentAtPath, removeItemAtPath } from "../lib";
import { findRootGitignoreFile } from "../lib/gitignore-tree";

interface FileChange {
  path: string;
  content: string;
  /** "base64" for binary assets (content already holds their base64 bytes) — see
   *  TemplateFile.encoding in path-to-json.ts. Absent means plain UTF-8 text. */
  encoding?: "base64";
  status: "modified" | "added" | "deleted";
}

interface FlattenedFile {
  content: string;
  encoding?: "base64";
}

/**
 * Secret-bearing files that must never show up as a trackable/pushable change,
 * regardless of what the project's own .gitignore says. This exists because
 * several bundled starter templates ship with an empty .gitignore (e.g.
 * react, react-ts, vue), and even a populated one (plain nextjs) may only
 * cover ".env*.local" and miss a bare ".env" — either gap would otherwise let
 * real secrets get pushed to GitHub. Deliberately narrow (not ".env.example",
 * ".env.sample", etc.) since those are meant to be committed.
 */
const ALWAYS_IGNORED_PATTERNS = [".env", ".env.local", ".env*.local"].join("\n");

/**
 * Builds a gitignore matcher combining the always-ignored secret baseline
 * above with the project's own root-level .gitignore file content (if
 * present), so Source Control tracks changes exactly the way `git status`
 * would — ignored files never show up as changes and are never
 * committed/pushed. Only the root .gitignore is honored (no nested
 * per-directory .gitignore support, mirroring git's directory-scoped semantics
 * would require much more machinery than this DB-backed tree model has).
 */
function getIgnoreMatcher(tree: TemplateFolder | null): ReturnType<typeof ignore> {
  const matcher = ignore().add(ALWAYS_IGNORED_PATTERNS);
  const gitignoreFile = findRootGitignoreFile(tree);
  if (!gitignoreFile?.content) return matcher;

  try {
    return matcher.add(gitignoreFile.content);
  } catch {
    return matcher;
  }
}

function filterIgnored<V>(
  files: Map<string, V>,
  matcher: ReturnType<typeof ignore> | null
): Map<string, V> {
  if (!matcher) return files;
  const filtered = new Map<string, V>();
  for (const [path, value] of files) {
    if (!matcher.ignores(path)) filtered.set(path, value);
  }
  return filtered;
}

/**
 * Get the GitHub metadata for a playground (repo, branch info).
 */
export async function getPlaygroundGithubInfo(playgroundId: string) {
  try {
    const playground = await findPlaygroundById(playgroundId, {
      projection: { githubRepo: 1, githubBranch: 1, githubBaseContent: 1, userId: 1 },
    });

    if (!playground) return { error: "Playground not found" };

    return {
      githubRepo: playground.githubRepo,
      githubBranch: playground.githubBranch,
      hasGithubLink: !!playground.githubRepo && !!playground.githubBranch,
    };
  } catch (error) {
    console.error("Error getting playground GitHub info:", error);
    return { error: "Failed to get playground info" };
  }
}

/**
 * Commit and push changes from the playground back to GitHub.
 * Uses the Git Data API to create blobs, trees, commits, and update refs.
 */
/**
 * GitHub's content-creating endpoints can hit a transient secondary rate
 * limit when many are fired back-to-back with no spacing — most exposed
 * right here, since blob creation runs once per changed file in a loop, and
 * a repo's very first push (via repo creation) sends every current file at
 * once rather than the handful an incremental commit normally touches.
 * Retries with backoff on 403/429/5xx (rate limit / transient server error);
 * anything else fails immediately since retrying a bad request won't help.
 */
async function fetchGithubWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    const isRetryable = (res.status === 403 || res.status === 429 || res.status >= 500) && attempt < maxRetries;
    if (!isRetryable) return res;
    const retryAfterSeconds = Number(res.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 500 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

interface GithubFailure {
  message: string;
  /** Token missing/expired/insufficient scope — frontend should offer re-auth, not just retry. */
  needsReauth?: boolean;
  /** Non-fast-forward: the remote moved since we last read it. Never resolved by silently force-pushing. */
  isDiverged?: boolean;
  isRateLimited?: boolean;
  /** The repo itself is gone (deleted/renamed) or the token can no longer see it — distinct from a
   *  404 on a ref/path within a repo that still exists. Frontend offers "Create New Repository". */
  repoNotFound?: boolean;
}

/**
 * Cheap, on-demand disambiguation for a 404: is the *repo* gone, or is it just
 * this ref/path/commit that's missing from a repo that still exists? Only
 * ever called after something has already 404'd — never speculatively (e.g.
 * not on page load) — per the cost constraint on this check.
 * Returns true/false when conclusive, or null when the check itself was
 * inconclusive (network hiccup, rate limit, etc.) — callers must not treat
 * null as "confirmed gone", since that would misclassify a transient blip as
 * repo deletion.
 */
async function checkRepoExists(
  owner: string,
  repo: string,
  headers: HeadersInit
): Promise<boolean | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (res.status === 404) return false;
    if (res.ok) return true;
    return null;
  } catch {
    return null;
  }
}

/**
 * Single point of contact for a failed GitHub API call: logs one concise,
 * structured line (operation + status + GitHub's own message — never the
 * token) and classifies the failure into a user-actionable shape. This
 * replaces the earlier per-call verbose logging used to track down the
 * empty-repo/blob-creation bug — that investigation is done, but this
 * failure-only log line stays permanently so the *next* push failure is
 * diagnosable from logs alone.
 */
async function reportGithubFailure(
  operation: string,
  res: Response,
  ctx: { owner: string; repo: string; branch?: string },
  headers: HeadersInit
): Promise<GithubFailure> {
  let ghMessage: string | undefined;
  try {
    ghMessage = (await res.json())?.message;
  } catch {
    ghMessage = undefined;
  }
  console.error(`[github-push] ${operation} failed: ${res.status}${ghMessage ? ` ${ghMessage}` : ""}`, ctx);

  if (res.status === 401) {
    return {
      message: "Your GitHub connection has expired. Reconnect your GitHub account to continue.",
      needsReauth: true,
    };
  }
  if (res.status === 403 && /rate limit/i.test(ghMessage || "")) {
    return { message: "GitHub is rate-limiting these requests right now. Wait a moment and try pushing again.", isRateLimited: true };
  }
  if (res.status === 403) {
    return {
      message: "GitHub denied this request — your connection may be missing repository permissions. Reconnect your GitHub account.",
      needsReauth: true,
    };
  }
  if (res.status === 429) {
    return { message: "GitHub is rate-limiting these requests right now. Wait a moment and try pushing again.", isRateLimited: true };
  }
  if (res.status === 422 && /fast.?forward/i.test(ghMessage || "")) {
    return {
      message: "The remote repository has changed since your last push (someone/something else committed to it). Refresh Source Control and try again — this never force-pushes automatically.",
      isDiverged: true,
    };
  }
  if (res.status === 404) {
    // Distinguish "repo itself is gone" from "just this ref/path/commit is
    // missing on a repo that still exists" (e.g. a divergent regression case:
    // an existing repo missing a branch ref is NOT "repo gone"). GitHub also
    // 404s (never 403) for private repos the token lost access to, hence the
    // wording covering both possibilities below.
    const exists = await checkRepoExists(ctx.owner, ctx.repo, headers);
    if (exists === false) {
      return {
        message: `The linked GitHub repository (${ctx.owner}/${ctx.repo}) no longer exists or is no longer accessible. It may have been deleted or renamed on GitHub.`,
        repoNotFound: true,
      };
    }
    return { message: ghMessage ? `${res.status} ${ghMessage}` : `GitHub API error (404): ${operation}` };
  }
  return { message: ghMessage ? `${res.status} ${ghMessage}` : `GitHub API error (${res.status})` };
}

export async function commitChangesToGithub(
  playgroundId: string,
  commitMessage: string
): Promise<{ success: boolean; commitUrl?: string; error?: string; needsReauth?: boolean; repoNotFound?: boolean }> {
  try {
    const user = await currentUser();
    if (!user?.id) return { success: false, error: "Not authenticated" };

    // 1. Get playground data
    const playground = await findPlaygroundWithTemplateFiles(playgroundId);

    if (!playground) return { success: false, error: "Playground not found" };
    if (playground.userId !== user.id)
      return { success: false, error: "Unauthorized" };
    if (!playground.githubRepo || !playground.githubBranch)
      return { success: false, error: "No GitHub repository linked" };

    // 2. Get GitHub access token
    const account = await findAccountByUserIdAndProvider(user.id, "github");

    if (!account?.accessToken)
      return { success: false, error: "Connect your GitHub account first", needsReauth: true };

    const headers = {
      Authorization: `Bearer ${account.accessToken}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };

    const [owner, repo] = playground.githubRepo.split("/");
    const branch = playground.githubBranch;
    const ghCtx = { owner, repo, branch };

    // 3. Calculate file changes
    const currentContent = playground.templateFiles[0]?.content;
    const baseContent = playground.githubBaseContent;

    if (!currentContent) return { success: false, error: "No file content found" };

    const currentTree = typeof currentContent === "string"
      ? JSON.parse(currentContent)
      : currentContent;
    const baseTree = baseContent ? JSON.parse(baseContent) : null;

    const matcher = getIgnoreMatcher(currentTree);
    const currentFiles = filterIgnored(flattenTemplateFolder(currentTree), matcher);
    const baseFiles = filterIgnored(
      baseTree ? flattenTemplateFolder(baseTree) : new Map<string, FlattenedFile>(),
      matcher
    );

    // Phase 2 guard: even with the persistence gap fixed at the source (see
    // dashboard's createPlayground + the /api/template self-heal), a tree
    // could still end up with a file entry whose content never made it in.
    // Fail loud and specific here rather than pushing an empty/garbage blob
    // or falling back to the vague top-level "No file content found".
    const missingContentPaths = collectMissingContentPaths(currentFiles);
    if (missingContentPaths.length > 0) {
      console.error(
        `[github-push] ${missingContentPaths.length} file(s) missing stored content for playground ${playgroundId}:`,
        missingContentPaths
      );
      return {
        success: false,
        error: `Cannot publish — ${missingContentPaths.length} file${missingContentPaths.length === 1 ? "" : "s"} missing saved content: ${missingContentPaths.join(", ")}. Try reopening the project or contact support if this persists.`,
      };
    }

    const changes = calculateChanges(baseFiles, currentFiles);

    if (changes.length === 0) {
      return { success: false, error: "No changes to commit" };
    }

    // 4. Get the current branch SHA (latest commit), if any. A repo created
    // via POST /user/repos with auto_init:false has no commits and no
    // `refs/heads/{branch}` yet — neither status is an error here, it means
    // this push is the one that bootstraps the branch (first-ever commit, no
    // parent). This is what lets a freshly-created-and-linked repo use this
    // exact same function for its initial push instead of a separate
    // "initial push" implementation.
    //
    // GitHub's Git Data API is inconsistent about which status it uses for
    // "this ref doesn't exist": a repo that already has *some* commits but
    // not this specific branch 404s, but a genuinely brand-new empty repo
    // (zero objects at all) 409s with "Git Repository is empty." instead —
    // both mean the same thing for our purposes (no parent commit to build
    // on), so both are treated as the bootstrap case.
    const refRes = await fetchGithubWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      { headers }
    );
    let latestCommitSha: string | null = null;
    if (refRes.status === 404 || refRes.status === 409) {
      // A 404 here is ambiguous: it's the expected signal for a genuinely
      // brand-new repo with no commits yet (bootstrap case, handled below) —
      // but it's ALSO exactly what a deleted/renamed/inaccessible repo
      // returns. A 409 ("Git Repository is empty") only ever comes from a
      // repo that demonstrably still exists, so only 404 needs the extra
      // check; disambiguating unconditionally on every legitimate first-ever
      // push would be wasted cost for no benefit.
      if (refRes.status === 404) {
        const exists = await checkRepoExists(owner, repo, headers);
        if (exists === false) {
          console.error(`[github-push] repo not found: ${owner}/${repo}`);
          return {
            success: false,
            error: `The linked GitHub repository (${owner}/${repo}) no longer exists or is no longer accessible. It may have been deleted or renamed on GitHub.`,
            repoNotFound: true,
          };
        }
      }
      latestCommitSha = null;
    } else if (!refRes.ok) {
      const failure = await reportGithubFailure("get branch ref", refRes, ghCtx, headers);
      return { success: false, error: failure.message, needsReauth: failure.needsReauth, repoNotFound: failure.repoNotFound };
    } else {
      const refData = await refRes.json();
      latestCommitSha = refData.object.sha;
    }

    let baseTreeSha: string | undefined;

    // 4b. Bootstrapping a genuinely empty repo (0 commits): GitHub's Git Data
    // API (blobs/trees/commits) flatly refuses to operate at all until the
    // repo has at least one commit — creating a blob 409s with the exact
    // same "Git Repository is empty" message the ref lookup above does.
    // Tolerating that status on reads (above) isn't enough; the write side
    // hits the same wall. The one endpoint GitHub special-cases to work on a
    // truly empty repo is the Contents API, so the bootstrap case seeds the
    // branch with ONE file via that API — which creates both the branch ref
    // and its first commit in a single call — then falls through to the
    // normal Git Data API flow below for every other file, built on top of
    // that seed commit as its parent. (auto_init:true at repo-creation time
    // would avoid needing this, but that adds an unwanted README commit that
    // isn't part of the user's actual project.)
    let remainingChanges = changes;
    if (!latestCommitSha) {
      const seedIndex = changes.findIndex((c) => c.status !== "deleted");
      // Bootstrap means baseFiles was empty, so every change is "added" —
      // this findIndex is just defensive, not expected to ever miss.
      if (seedIndex === -1) {
        return { success: false, error: "Nothing to seed the initial commit with" };
      }
      const seedChange = changes[seedIndex];
      // The Contents API always wants base64 in `content`. A binary asset's
      // content is ALREADY base64 (see TemplateFile.encoding) — re-encoding
      // it here would double-encode and corrupt it; only plain text needs
      // the utf-8 -> base64 conversion.
      const seedContentBase64 = seedChange.encoding === "base64"
        ? seedChange.content
        : Buffer.from(seedChange.content, "utf-8").toString("base64");
      const seedRes = await fetchGithubWithRetry(
        `https://api.github.com/repos/${owner}/${repo}/contents/${seedChange.path}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            message: commitMessage,
            content: seedContentBase64,
            branch,
          }),
        }
      );
      if (!seedRes.ok) {
        const failure = await reportGithubFailure("seed initial commit", seedRes, ghCtx, headers);
        return { success: false, error: failure.message, needsReauth: failure.needsReauth, repoNotFound: failure.repoNotFound };
      }
      const seedData = await seedRes.json();
      latestCommitSha = seedData.commit.sha;
      baseTreeSha = seedData.commit.tree.sha;
      remainingChanges = changes.filter((_, i) => i !== seedIndex);

      if (remainingChanges.length === 0) {
        await updatePlaygroundGithubBaseContent(
          playgroundId,
          typeof currentContent === "string" ? currentContent : JSON.stringify(currentContent)
        );
        return { success: true, commitUrl: seedData.commit.html_url };
      }
    }

    // 5. Get the base tree SHA (skipped when bootstrapping just above — the
    // seed step already returned it directly from the Contents API response).
    if (latestCommitSha && baseTreeSha === undefined) {
      const commitRes = await fetchGithubWithRetry(
        `https://api.github.com/repos/${owner}/${repo}/git/commits/${latestCommitSha}`,
        { headers }
      );
      if (!commitRes.ok) {
        const failure = await reportGithubFailure("get base commit", commitRes, ghCtx, headers);
        return { success: false, error: failure.message, needsReauth: failure.needsReauth, repoNotFound: failure.repoNotFound };
      }
      const commitData = await commitRes.json();
      baseTreeSha = commitData.tree.sha;
    }

    // 6. Create blobs for changed/added files
    const treeItems: any[] = [];

    for (const change of remainingChanges) {
      if (change.status === "deleted") {
        treeItems.push({
          path: change.path,
          mode: "100644",
          type: "blob",
          sha: null, // null SHA deletes the file
        });
      } else {
        // Create a blob for the file content. Binary assets are already
        // base64 (see TemplateFile.encoding) — tell GitHub so, rather than
        // always claiming utf-8, which would corrupt them.
        const blobRes = await fetchGithubWithRetry(
          `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              content: change.content,
              encoding: change.encoding === "base64" ? "base64" : "utf-8",
            }),
          }
        );
        if (!blobRes.ok) {
          const failure = await reportGithubFailure(`create blob (${change.path})`, blobRes, ghCtx, headers);
          return { success: false, error: failure.message, needsReauth: failure.needsReauth, repoNotFound: failure.repoNotFound };
        }
        const blobData = await blobRes.json();

        treeItems.push({
          path: change.path,
          mode: "100644",
          type: "blob",
          sha: blobData.sha,
        });
      }
    }

    // 7. Create a new tree (no base_tree when bootstrapping — the tree stands
    // on its own since there's no prior commit to layer onto)
    const newTreeRes = await fetchGithubWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
          tree: treeItems,
        }),
      }
    );
    if (!newTreeRes.ok) {
      const failure = await reportGithubFailure("create tree", newTreeRes, ghCtx, headers);
      return { success: false, error: failure.message, needsReauth: failure.needsReauth, repoNotFound: failure.repoNotFound };
    }
    const newTreeData = await newTreeRes.json();

    // 8. Create a new commit (no parents on the bootstrap commit)
    const newCommitRes = await fetchGithubWithRetry(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: commitMessage,
          tree: newTreeData.sha,
          parents: latestCommitSha ? [latestCommitSha] : [],
        }),
      }
    );
    if (!newCommitRes.ok) {
      const failure = await reportGithubFailure("create commit", newCommitRes, ghCtx, headers);
      return { success: false, error: failure.message, needsReauth: failure.needsReauth, repoNotFound: failure.repoNotFound };
    }
    const newCommitData = await newCommitRes.json();

    // 9. Point the branch at the new commit — PATCH an existing ref, or POST
    // a brand new one when this is the branch's first-ever commit. force is
    // always false: a non-fast-forward rejection here means the remote moved
    // since we read it, and that's reported to the user as a divergence
    // error (see reportGithubFailure), never silently overwritten.
    const updateRefRes = latestCommitSha
      ? await fetchGithubWithRetry(
          `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ sha: newCommitData.sha, force: false }),
          }
        )
      : await fetchGithubWithRetry(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
          method: "POST",
          headers,
          body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: newCommitData.sha }),
        });
    if (!updateRefRes.ok) {
      const failure = await reportGithubFailure(
        latestCommitSha ? "update ref (PATCH)" : "create ref (POST)",
        updateRefRes,
        ghCtx,
        headers
      );
      return { success: false, error: failure.message, needsReauth: failure.needsReauth, repoNotFound: failure.repoNotFound };
    }

    // 10. Update the base content in the database to the new state
    await updatePlaygroundGithubBaseContent(
      playgroundId,
      typeof currentContent === "string"
        ? currentContent
        : JSON.stringify(currentContent)
    );

    return {
      success: true,
      commitUrl: newCommitData.html_url,
    };
  } catch (error) {
    // Reached when something throws before/between the GitHub calls above
    // (e.g. JSON.parse on a malformed tree) rather than a GitHub API call
    // itself failing — reportGithubFailure handles the latter. Surfacing the
    // real message here (never a bare "push failed") is what makes this
    // branch diagnosable from a single report instead of another
    // instrumentation round.
    console.error("[github-push] Unhandled exception committing to GitHub:", error);
    return {
      success: false,
      error: `Failed to commit changes: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Flatten a TemplateFolder tree into a map of path -> { content, encoding }.
 */
function flattenTemplateFolder(
  folder: any,
  prefix: string = ""
): Map<string, FlattenedFile> {
  const files = new Map<string, FlattenedFile>();

  if (!folder?.items) return files;

  for (const item of folder.items) {
    if ("folderName" in item) {
      // It's a folder
      const folderPath = prefix ? `${prefix}/${item.folderName}` : item.folderName;
      const subFiles = flattenTemplateFolder(item, folderPath);
      for (const [path, entry] of subFiles) {
        files.set(path, entry);
      }
    } else {
      // It's a file
      const fileName = item.fileExtension
        ? `${item.filename}.${item.fileExtension}`
        : item.filename;
      const filePath = prefix ? `${prefix}/${fileName}` : fileName;
      files.set(filePath, {
        // Deliberately NOT coerced to "" here — a missing/null/undefined
        // content field (the exact template-persistence corruption this is
        // guarding against) must stay visibly not-a-string so
        // collectMissingContentPaths can catch it, instead of silently
        // becoming indistinguishable from a legitimately empty file.
        content: item.content,
        encoding: item.encoding === "base64" ? "base64" : undefined,
      });
    }
  }

  return files;
}

/**
 * Defensive guard against the exact class of bug this was written to catch:
 * a TemplateFile item whose `content` never actually got persisted (null,
 * undefined, or otherwise not a string) sitting alongside otherwise-healthy
 * files in the same tree. Deliberately does NOT flag a plain empty string —
 * a template can legitimately ship a 0-byte file — only genuinely missing
 * content, so this can't false-positive on that case.
 */
function collectMissingContentPaths(files: Map<string, FlattenedFile>): string[] {
  const missing: string[] = [];
  for (const [path, entry] of files) {
    if (typeof entry.content !== "string") missing.push(path);
  }
  return missing;
}

/**
 * Calculate file changes between base and current state.
 */
function calculateChanges(
  baseFiles: Map<string, FlattenedFile>,
  currentFiles: Map<string, FlattenedFile>
): FileChange[] {
  const changes: FileChange[] = [];

  // Check for modified and added files
  for (const [path, entry] of currentFiles) {
    const baseEntry = baseFiles.get(path);
    if (baseEntry === undefined) {
      changes.push({ path, content: entry.content, encoding: entry.encoding, status: "added" });
    } else if (baseEntry.content !== entry.content) {
      changes.push({ path, content: entry.content, encoding: entry.encoding, status: "modified" });
    }
  }

  // Check for deleted files
  for (const [path] of baseFiles) {
    if (!currentFiles.has(path)) {
      changes.push({ path, content: "", status: "deleted" });
    }
  }

  return changes;
}

/**
 * Get list of file changes between the playground's current state and base GitHub state.
 */
export async function getPlaygroundChangesList(
  playgroundId: string
): Promise<{ changes: { path: string; status: "modified" | "added" | "deleted" }[]; error?: string }> {
  try {
    const user = await currentUser();
    if (!user?.id) return { changes: [], error: "Not authenticated" };

    const playground = await findPlaygroundWithTemplateFiles(playgroundId);

    if (!playground) return { changes: [], error: "Playground not found" };

    const currentContent = playground.templateFiles[0]?.content;
    const baseContent = playground.githubBaseContent;

    if (!currentContent) return { changes: [] };

    const currentTree = typeof currentContent === "string"
      ? JSON.parse(currentContent)
      : currentContent;
    const baseTree = baseContent ? JSON.parse(baseContent) : null;

    const matcher = getIgnoreMatcher(currentTree);
    const currentFiles = filterIgnored(flattenTemplateFolder(currentTree), matcher);
    const baseFiles = filterIgnored(
      baseTree ? flattenTemplateFolder(baseTree) : new Map<string, FlattenedFile>(),
      matcher
    );
    const changes = calculateChanges(baseFiles, currentFiles);

    return {
      changes: changes.map((c) => ({ path: c.path, status: c.status })),
    };
  } catch (error) {
    console.error("Error getting changes list:", error);
    return { changes: [], error: "Failed to get changes list" };
  }
}

/**
 * Discards local changes to a single tracked file, resetting it to exactly the
 * content last synced from GitHub (equivalent to `git checkout -- <file>`).
 * An "added" file (no base counterpart) is removed entirely; a "deleted" file
 * (present in base, absent from current) is restored. Only ever touches the
 * one file at `filePath` — every other file's content is untouched.
 */
export async function discardFileChanges(
  playgroundId: string,
  filePath: string
): Promise<{
  success: boolean;
  newTemplateData?: TemplateFolder;
  resultingContent?: string | null;
  error?: string;
}> {
  try {
    const user = await currentUser();
    if (!user?.id) return { success: false, error: "Not authenticated" };

    const playground = await findPlaygroundWithTemplateFiles(playgroundId);

    if (!playground) return { success: false, error: "Playground not found" };
    if (playground.userId !== user.id) return { success: false, error: "Unauthorized" };

    const currentContent = playground.templateFiles[0]?.content;
    if (!currentContent) return { success: false, error: "No file content found" };

    const currentTree: TemplateFolder =
      typeof currentContent === "string" ? JSON.parse(currentContent) : currentContent;
    const baseContent = playground.githubBaseContent;
    const baseTree: TemplateFolder | null = baseContent ? JSON.parse(baseContent) : null;

    const matcher = getIgnoreMatcher(currentTree);
    if (matcher?.ignores(filePath)) {
      return { success: false, error: "File is ignored and has no tracked changes to discard" };
    }

    const baseFiles = baseTree ? flattenTemplateFolder(baseTree) : new Map<string, FlattenedFile>();
    const baseFileEntry = baseFiles.get(filePath);
    const baseFileContent = baseFileEntry?.content;

    const newTree =
      baseFileContent === undefined
        ? removeItemAtPath(currentTree, filePath) // was "added" — discard = remove entirely
        : setFileContentAtPath(currentTree, filePath, baseFileContent); // "modified"/"deleted" — restore

    await updateTemplateFileContent(playgroundId, JSON.stringify(newTree));

    return {
      success: true,
      newTemplateData: newTree,
      resultingContent: baseFileContent ?? null,
    };
  } catch (error) {
    console.error("Error discarding file changes:", error);
    return { success: false, error: "Failed to discard changes" };
  }
}

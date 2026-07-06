"use server";

import ignore from "ignore";
import { db } from "@/lib/db";
import { currentUser } from "@/modules/auth/actions";
import type { TemplateFolder } from "../lib/path-to-json";
import { setFileContentAtPath, removeItemAtPath } from "../lib";

interface FileChange {
  path: string;
  content: string;
  status: "modified" | "added" | "deleted";
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
  if (!tree?.items) return matcher;

  const gitignoreFile = tree.items.find(
    (item): item is { filename: string; fileExtension: string; content: string } =>
      "filename" in item && item.filename === ".gitignore" && item.fileExtension === ""
  );
  if (!gitignoreFile?.content) return matcher;

  try {
    return matcher.add(gitignoreFile.content);
  } catch {
    return matcher;
  }
}

function filterIgnored(
  files: Map<string, string>,
  matcher: ReturnType<typeof ignore> | null
): Map<string, string> {
  if (!matcher) return files;
  const filtered = new Map<string, string>();
  for (const [path, content] of files) {
    if (!matcher.ignores(path)) filtered.set(path, content);
  }
  return filtered;
}

/**
 * Get the GitHub metadata for a playground (repo, branch info).
 */
export async function getPlaygroundGithubInfo(playgroundId: string) {
  try {
    const playground = await db.playground.findUnique({
      where: { id: playgroundId },
      select: {
        githubRepo: true,
        githubBranch: true,
        githubBaseContent: true,
        userId: true,
      },
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
export async function commitChangesToGithub(
  playgroundId: string,
  commitMessage: string
): Promise<{ success: boolean; commitUrl?: string; error?: string }> {
  try {
    const user = await currentUser();
    if (!user?.id) return { success: false, error: "Not authenticated" };

    // 1. Get playground data
    const playground = await db.playground.findUnique({
      where: { id: playgroundId },
      include: {
        templateFiles: {
          select: { content: true },
        },
      },
    });

    if (!playground) return { success: false, error: "Playground not found" };
    if (playground.userId !== user.id)
      return { success: false, error: "Unauthorized" };
    if (!playground.githubRepo || !playground.githubBranch)
      return { success: false, error: "No GitHub repository linked" };

    // 2. Get GitHub access token
    const account = await db.account.findFirst({
      where: { userId: user.id, provider: "github" },
      select: { accessToken: true },
    });

    if (!account?.accessToken)
      return { success: false, error: "GitHub account not linked" };

    const headers = {
      Authorization: `Bearer ${account.accessToken}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };

    const [owner, repo] = playground.githubRepo.split("/");
    const branch = playground.githubBranch;

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
      baseTree ? flattenTemplateFolder(baseTree) : new Map<string, string>(),
      matcher
    );
    const changes = calculateChanges(baseFiles, currentFiles);

    if (changes.length === 0) {
      return { success: false, error: "No changes to commit" };
    }

    // 4. Get the current branch SHA (latest commit)
    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      { headers }
    );
    if (!refRes.ok)
      return { success: false, error: `Failed to get branch ref: ${refRes.status}` };
    const refData = await refRes.json();
    const latestCommitSha = refData.object.sha;

    // 5. Get the base tree SHA
    const commitRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits/${latestCommitSha}`,
      { headers }
    );
    if (!commitRes.ok)
      return { success: false, error: `Failed to get commit: ${commitRes.status}` };
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 6. Create blobs for changed/added files
    const treeItems: any[] = [];

    for (const change of changes) {
      if (change.status === "deleted") {
        treeItems.push({
          path: change.path,
          mode: "100644",
          type: "blob",
          sha: null, // null SHA deletes the file
        });
      } else {
        // Create a blob for the file content
        const blobRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              content: change.content,
              encoding: "utf-8",
            }),
          }
        );
        if (!blobRes.ok) {
          return { success: false, error: `Failed to create blob for ${change.path}` };
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

    // 7. Create a new tree
    const newTreeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeItems,
        }),
      }
    );
    if (!newTreeRes.ok)
      return { success: false, error: `Failed to create tree: ${newTreeRes.status}` };
    const newTreeData = await newTreeRes.json();

    // 8. Create a new commit
    const newCommitRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: commitMessage,
          tree: newTreeData.sha,
          parents: [latestCommitSha],
        }),
      }
    );
    if (!newCommitRes.ok)
      return { success: false, error: `Failed to create commit: ${newCommitRes.status}` };
    const newCommitData = await newCommitRes.json();

    // 9. Update the branch reference
    const updateRefRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          sha: newCommitData.sha,
          force: false,
        }),
      }
    );
    if (!updateRefRes.ok)
      return { success: false, error: `Failed to update branch: ${updateRefRes.status}` };

    // 10. Update the base content in the database to the new state
    await db.playground.update({
      where: { id: playgroundId },
      data: {
        githubBaseContent:
          typeof currentContent === "string"
            ? currentContent
            : JSON.stringify(currentContent),
      },
    });

    return {
      success: true,
      commitUrl: newCommitData.html_url,
    };
  } catch (error) {
    console.error("Error committing to GitHub:", error);
    return { success: false, error: "Failed to commit changes" };
  }
}

/**
 * Flatten a TemplateFolder tree into a map of path -> content.
 */
function flattenTemplateFolder(
  folder: any,
  prefix: string = ""
): Map<string, string> {
  const files = new Map<string, string>();

  if (!folder?.items) return files;

  for (const item of folder.items) {
    if ("folderName" in item) {
      // It's a folder
      const folderPath = prefix ? `${prefix}/${item.folderName}` : item.folderName;
      const subFiles = flattenTemplateFolder(item, folderPath);
      for (const [path, content] of subFiles) {
        files.set(path, content);
      }
    } else {
      // It's a file
      const fileName = item.fileExtension
        ? `${item.filename}.${item.fileExtension}`
        : item.filename;
      const filePath = prefix ? `${prefix}/${fileName}` : fileName;
      files.set(filePath, item.content || "");
    }
  }

  return files;
}

/**
 * Calculate file changes between base and current state.
 */
function calculateChanges(
  baseFiles: Map<string, string>,
  currentFiles: Map<string, string>
): FileChange[] {
  const changes: FileChange[] = [];

  // Check for modified and added files
  for (const [path, content] of currentFiles) {
    const baseContent = baseFiles.get(path);
    if (baseContent === undefined) {
      changes.push({ path, content, status: "added" });
    } else if (baseContent !== content) {
      changes.push({ path, content, status: "modified" });
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

    const playground = await db.playground.findUnique({
      where: { id: playgroundId },
      include: {
        templateFiles: {
          select: { content: true },
        },
      },
    });

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
      baseTree ? flattenTemplateFolder(baseTree) : new Map<string, string>(),
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

    const playground = await db.playground.findUnique({
      where: { id: playgroundId },
      include: { templateFiles: { select: { content: true } } },
    });

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

    const baseFiles = baseTree ? flattenTemplateFolder(baseTree) : new Map<string, string>();
    const baseFileContent = baseFiles.get(filePath);

    const newTree =
      baseFileContent === undefined
        ? removeItemAtPath(currentTree, filePath) // was "added" — discard = remove entirely
        : setFileContentAtPath(currentTree, filePath, baseFileContent); // "modified"/"deleted" — restore

    await db.templateFile.update({
      where: { playgroundId },
      data: { content: JSON.stringify(newTree) },
    });

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

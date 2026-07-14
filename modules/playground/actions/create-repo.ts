"use server";

import {
  findPlaygroundWithTemplateFiles,
  updatePlaygroundGithubRepo,
} from "@/lib/db/repositories/playgrounds";
import { findAccountByUserIdAndProvider } from "@/lib/db/repositories/accounts";
import { updateTemplateFileContent } from "@/lib/db/repositories/templateFiles";
import { currentUser } from "@/modules/auth/actions";
import type { Templates } from "@/lib/db/schemas";
import type { TemplateFolder } from "../lib/path-to-json";
import { commitChangesToGithub } from "./commit";
import { findRootGitignoreFile } from "../lib/gitignore-tree";
import { GITHUB_REPO_NAME_RE, sanitizeRepoName } from "../lib/repo-name";

/**
 * Minimal per-stack .gitignore, generated only when the project has no root
 * .gitignore of its own. Deliberately conservative (common build output +
 * dependency dirs + secrets) rather than trying to fully replicate
 * `gitignore.io` output for every template.
 */
function generateGitignore(template: Templates): string {
  const lines = [
    "node_modules/",
    "dist/",
    "build/",
    ".env",
    ".env.*",
    "!.env.example",
    "*.log",
    ".DS_Store",
  ];
  if (template === "NEXTJS") lines.push(".next/", "out/");
  if (template === "ANGULAR") lines.push(".angular/");
  return lines.join("\n") + "\n";
}

function addGitignoreIfMissing(tree: TemplateFolder, template: Templates): TemplateFolder | null {
  if (findRootGitignoreFile(tree)) return null;
  return {
    ...tree,
    items: [
      ...tree.items,
      { filename: ".gitignore", fileExtension: "", content: generateGitignore(template) },
    ],
  };
}

export interface CreateGithubRepoInput {
  name: string;
  private: boolean;
  description?: string;
}

export interface CreateGithubRepoResult {
  success: boolean;
  repoUrl?: string;
  error?: string;
  /** Token is missing/lacks the `repo` scope — frontend should offer re-auth, not just retry. */
  needsReauth?: boolean;
  /** Repo was created and linked, but the initial push failed — Source Control (Commit/Push) is now the retry path, not this action. */
  partial?: boolean;
}

/**
 * Creates a GitHub repository for a template-originated playground, pushes
 * its current files as the initial commit, and links the repo the same way
 * an imported project is linked — from then on this playground is
 * indistinguishable from an imported one to every other code path (Source
 * Control, commitChangesToGithub, etc. all key off githubRepo/githubBranch).
 */
export async function createGithubRepoForPlayground(
  playgroundId: string,
  input: CreateGithubRepoInput
): Promise<CreateGithubRepoResult> {
  try {
    const user = await currentUser();
    if (!user?.id) return { success: false, error: "Not authenticated" };

    const playground = await findPlaygroundWithTemplateFiles(playgroundId);
    if (!playground) return { success: false, error: "Playground not found" };
    if (playground.userId !== user.id) return { success: false, error: "Unauthorized" };
    if (playground.githubRepo) {
      return { success: false, error: "This project already has a linked GitHub repository" };
    }

    const account = await findAccountByUserIdAndProvider(user.id, "github");
    if (!account?.accessToken) {
      return { success: false, error: "Connect your GitHub account first", needsReauth: true };
    }
    // Defense-in-depth: the provider config requests `repo` scope for every
    // sign-in, but a token stored under an older/different scope grant would
    // still 403 on repo creation — catch that here before spending an API
    // call, and again below as a fallback in case this stored value is stale.
    if (account.scope && !account.scope.split(/[ ,]+/).includes("repo")) {
      return {
        success: false,
        error: "Your GitHub connection is missing repository-creation permission.",
        needsReauth: true,
      };
    }

    const name = sanitizeRepoName(input.name);
    if (!GITHUB_REPO_NAME_RE.test(name)) {
      return { success: false, error: "Repository name contains invalid characters" };
    }

    const headers = {
      Authorization: `Bearer ${account.accessToken}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };

    const createRes = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name,
        private: input.private,
        description: input.description || undefined,
        auto_init: false,
      }),
    });

    if (createRes.status === 403) {
      const body = await createRes.json().catch(() => null);
      console.error("[github-push] create repo failed: 403", body?.message, { name });
      const isRateLimited = /rate limit/i.test(body?.message || "");
      return {
        success: false,
        error: isRateLimited
          ? "GitHub is rate-limiting these requests right now. Wait a moment and try again."
          : "GitHub denied repository creation — your connection may be missing permissions.",
        needsReauth: !isRateLimited,
      };
    }
    if (createRes.status === 422) {
      const body = await createRes.json().catch(() => null);
      const messages = [body?.message, ...((body?.errors as { message?: string }[] | undefined)?.map((e) => e.message) ?? [])]
        .filter(Boolean)
        .join(" ");
      console.error("[github-push] create repo failed: 422", messages, { name });
      const isNameConflict = /already exists/i.test(messages);
      return {
        success: false,
        error: isNameConflict
          ? "A repository with this name already exists on your GitHub account. Try another name."
          : messages || "GitHub rejected the repository name.",
      };
    }
    if (!createRes.ok) {
      const body = await createRes.json().catch(() => null);
      console.error("[github-push] create repo failed:", createRes.status, body?.message, { name });
      return {
        success: false,
        error: body?.message ? `${createRes.status} ${body.message}` : `Failed to create repository (${createRes.status})`,
      };
    }

    const repoData = await createRes.json();
    const owner: string = repoData.owner.login;
    const repoName: string = repoData.name;
    const branch: string = repoData.default_branch || "main";

    // Ensure a .gitignore exists before the very first push, not after —
    // ".env"/secret patterns are already hard-excluded regardless (see
    // ALWAYS_IGNORED_PATTERNS in commit.ts), this is just so the pushed repo
    // itself looks like a normal project rather than one missing a
    // .gitignore entirely.
    const currentContent = playground.templateFiles[0]?.content;
    const currentTree: TemplateFolder | null = currentContent
      ? (typeof currentContent === "string" ? JSON.parse(currentContent) : (currentContent as TemplateFolder))
      : null;

    if (currentTree) {
      const withGitignore = addGitignoreIfMissing(currentTree, playground.template);
      if (withGitignore) {
        await updateTemplateFileContent(playgroundId, JSON.stringify(withGitignore));
      }
    }

    // Link the repo BEFORE pushing. If the push below fails, the project is
    // still left usable: githubBaseContent stays null, so the normal Source
    // Control panel (commitChangesToGithub) will show every current file as
    // "added" and the user can commit+push manually — that IS the retry
    // path, deliberately, instead of a second "retry initial push" endpoint.
    await updatePlaygroundGithubRepo(playgroundId, `${owner}/${repoName}`, branch);

    const pushResult = await commitChangesToGithub(playgroundId, "Initial commit");
    if (!pushResult.success) {
      return {
        success: true,
        partial: true,
        repoUrl: repoData.html_url,
        error: `Repository created, but the initial push failed: ${pushResult.error}. Open Source Control to push manually.`,
      };
    }

    return { success: true, repoUrl: repoData.html_url };
  } catch (error) {
    console.error("[github-push] Unhandled exception creating GitHub repository:", error);
    // TEMPORARY: surface the real message while diagnosing.
    return {
      success: false,
      error: `Failed to create repository: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

"use server";

import { findAccountByUserIdAndProvider } from "@/lib/db/repositories/accounts";
import { createPlaygroundWithTemplateFile } from "@/lib/db/repositories/playgrounds";
import { currentUser } from "@/modules/auth/actions";
import { revalidatePath } from "next/cache";

// Binary file extensions to skip when importing
const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "svg", "webp", "avif",
  "mp3", "mp4", "wav", "ogg", "webm", "avi", "mov",
  "zip", "tar", "gz", "rar", "7z",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "woff", "woff2", "ttf", "eot", "otf",
  "exe", "dll", "so", "dylib",
  "pyc", "class", "o", "obj",
  "lock",
]);

// Max file size to import (100KB)
const MAX_FILE_SIZE = 100 * 1024;

// .env-family files are never imported from a repo, even if committed there —
// secrets belong in the platform's own env handling, not copied verbatim into
// a Playground's stored file tree (mirrors the exclusion in path-to-json.ts).
const ENV_FILE_PATTERN = /(^|\/)\.env(\..+)?$/;

/**
 * Check if the current user has a linked GitHub account.
 */
export async function checkGithubLink(): Promise<{
  linked: boolean;
  error?: string;
}> {
  try {
    const user = await currentUser();
    if (!user?.id) return { linked: false, error: "Not authenticated" };

    const account = await findAccountByUserIdAndProvider(user.id, "github");

    return { linked: !!account };
  } catch (error) {
    console.error("Error checking GitHub link:", error);
    return { linked: false, error: "Failed to check GitHub link" };
  }
}

/**
 * Fetch the authenticated user's owned GitHub repositories.
 */
export async function fetchUserRepos(): Promise<{
  repos: { name: string; full_name: string; private: boolean; description: string | null }[];
  error?: string;
}> {
  try {
    const user = await currentUser();
    if (!user?.id) return { repos: [], error: "Not authenticated" };

    const account = await findAccountByUserIdAndProvider(user.id, "github");

    if (!account?.accessToken) {
      return { repos: [], error: "GitHub account not linked" };
    }

    const allRepos: any[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const res = await fetch(
        `https://api.github.com/user/repos?affiliation=owner&sort=updated&per_page=${perPage}&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!res.ok) {
        return { repos: [], error: `GitHub API error: ${res.status}` };
      }

      const data = await res.json();
      if (data.length === 0) break;

      allRepos.push(...data);
      if (data.length < perPage) break;
      page++;
    }

    return {
      repos: allRepos.map((r: any) => ({
        name: r.name,
        full_name: r.full_name,
        private: r.private,
        description: r.description,
      })),
    };
  } catch (error) {
    console.error("Error fetching repos:", error);
    return { repos: [], error: "Failed to fetch repositories" };
  }
}

/**
 * Fetch branches for a specific repository.
 */
export async function fetchRepoBranches(
  owner: string,
  repo: string
): Promise<{
  branches: { name: string }[];
  defaultBranch?: string;
  error?: string;
}> {
  try {
    const user = await currentUser();
    if (!user?.id) return { branches: [], error: "Not authenticated" };

    const account = await findAccountByUserIdAndProvider(user.id, "github");

    if (!account?.accessToken) {
      return { branches: [], error: "GitHub account not linked" };
    }

    const headers = {
      Authorization: `Bearer ${account.accessToken}`,
      Accept: "application/vnd.github.v3+json",
    };

    // Get repo info for default branch
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) {
      return { branches: [], error: `GitHub API error: ${repoRes.status}` };
    }
    const repoData = await repoRes.json();

    // Get branches
    const branchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`,
      { headers }
    );
    if (!branchRes.ok) {
      return { branches: [], error: `GitHub API error: ${branchRes.status}` };
    }
    const branchData = await branchRes.json();

    return {
      branches: branchData.map((b: any) => ({ name: b.name })),
      defaultBranch: repoData.default_branch,
    };
  } catch (error) {
    console.error("Error fetching branches:", error);
    return { branches: [], error: "Failed to fetch branches" };
  }
}

/**
 * Import a GitHub repository into the editor.
 * Uses the Git Trees API to fetch the full file structure without cloning.
 */
export async function importGithubRepository(
  owner: string,
  repo: string,
  branch: string
): Promise<{ playgroundId?: string; error?: string }> {
  try {
    const user = await currentUser();
    if (!user?.id) return { error: "Not authenticated" };

    const account = await findAccountByUserIdAndProvider(user.id, "github");

    if (!account?.accessToken) {
      return { error: "GitHub account not linked" };
    }

    const headers = {
      Authorization: `Bearer ${account.accessToken}`,
      Accept: "application/vnd.github.v3+json",
    };

    // 1. Get the recursive tree for the branch
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers }
    );

    if (!treeRes.ok) {
      return { error: `Failed to fetch repository tree: ${treeRes.status}` };
    }

    const treeData = await treeRes.json();
    const tree = treeData.tree as Array<{
      path: string;
      type: string;
      sha: string;
      size?: number;
    }>;

    // 2. Filter to only blob (file) entries, skipping binaries and large files
    const fileEntries = tree.filter((entry) => {
      if (entry.type !== "blob") return false;
      if (ENV_FILE_PATTERN.test(entry.path)) return false;
      const ext = entry.path.split(".").pop()?.toLowerCase() || "";
      if (BINARY_EXTENSIONS.has(ext)) return false;
      if (entry.size && entry.size > MAX_FILE_SIZE) return false;
      return true;
    });

    // 3. Fetch file contents in batches of 10
    const batchSize = 10;
    const fileContents: Map<string, string> = new Map();

    for (let i = 0; i < fileEntries.length; i += batchSize) {
      const batch = fileEntries.slice(i, i + batchSize);
      const promises = batch.map(async (entry) => {
        try {
          const blobRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/blobs/${entry.sha}`,
            { headers }
          );
          if (!blobRes.ok) return;
          const blobData = await blobRes.json();
          const content =
            blobData.encoding === "base64"
              ? Buffer.from(blobData.content, "base64").toString("utf-8")
              : blobData.content;
          fileContents.set(entry.path, content);
        } catch {
          // Skip files that fail to fetch
        }
      });
      await Promise.all(promises);
    }

    // 4. Build the TemplateFolder structure
    const rootFolder = buildTemplateFolderFromPaths(fileContents, repo);

    // 5. Create Playground + TemplateFile in database
    const playground = await createPlaygroundWithTemplateFile(
      {
        title: `${owner}/${repo}`,
        description: `Imported from GitHub (${branch} branch)`,
        template: "REACT", // Default template type for GitHub imports
        userId: user.id,
        githubRepo: `${owner}/${repo}`,
        githubBranch: branch,
        githubBaseContent: JSON.stringify(rootFolder),
      },
      JSON.stringify(rootFolder)
    );

    revalidatePath("/dashboard");
    return { playgroundId: playground.id };
  } catch (error) {
    console.error("Error importing repository:", error);
    return { error: "Failed to import repository" };
  }
}

/**
 * Build a TemplateFolder tree from flat path->content map.
 */
function buildTemplateFolderFromPaths(
  fileContents: Map<string, string>,
  rootName: string
) {
  interface TempFolder {
    folderName: string;
    items: (TempFolder | { filename: string; fileExtension: string; content: string })[];
  }

  const root: TempFolder = { folderName: rootName, items: [] };

  for (const [filePath, content] of fileContents) {
    const parts = filePath.split("/");
    let current = root;

    // Navigate/create folders for all but the last segment
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      let existing = current.items.find(
        (item): item is TempFolder =>
          "folderName" in item && item.folderName === folderName
      );

      if (!existing) {
        existing = { folderName, items: [] };
        current.items.push(existing);
      }
      current = existing;
    }

    // Add the file
    const fileName = parts[parts.length - 1];
    const lastDot = fileName.lastIndexOf(".");
    const name = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
    const ext = lastDot > 0 ? fileName.substring(lastDot + 1) : "";

    current.items.push({
      filename: name,
      fileExtension: ext,
      content,
    });
  }

  return root;
}

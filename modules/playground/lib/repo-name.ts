/**
 * Plain (non-"use server") module on purpose: this needs to be callable
 * synchronously from the client (live input sanitization/prefill in
 * create-github-repo-modal.tsx) as well as from the create-repo server
 * action. A "use server" file requires every export to be an async Server
 * Action, so a sync helper like this can't live in create-repo.ts itself —
 * that combination throws at build/runtime, which is what actually broke
 * opening the playground page.
 */

/** GitHub repo names: alphanumerics, hyphens, underscores, dots only. */
export const GITHUB_REPO_NAME_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * Turns an arbitrary project title into a valid, likely-unique-enough GitHub
 * repo name: lowercase, spaces to hyphens, anything else not in GitHub's
 * allowed set stripped, leading dots/hyphens removed (GitHub rejects those),
 * capped at GitHub's 100-char limit. Mirrors the "pre-filled but editable"
 * sanitization the create-repo modal shows the user before they submit.
 */
export function sanitizeRepoName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[.-]+/, "");
  return (cleaned || "new-project").slice(0, 100);
}

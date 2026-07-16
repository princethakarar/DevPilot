import type { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import { setFileContentAtPath } from "@/modules/playground/lib";

/**
 * .env-family files are never writable by the agent — same boundary the rest
 * of the app enforces (template scanning excludes them, GitHub push always
 * ignores them, see ALWAYS_IGNORED_PATTERNS in commit.ts). Secrets live in
 * PlaygroundEnvVar, not in a plaintext tree node the model can see or edit.
 */
const ENV_FILE_PATTERN = /(^|\/)\.env(\..+)?$/;

export interface WriteFileResult {
  ok: boolean;
  path: string;
  tree?: TemplateFolder;
  error?: string;
}

/**
 * Applies a write immediately to the in-memory tree — no proposal/approval
 * step, per the autonomous-agent spec. Caller (orchestrator) is responsible
 * for persisting the returned tree via upsertTemplateFileForPlayground and
 * for relaying the change to the browser's live WebContainer/editor.
 */
export function writeFile(root: TemplateFolder, filePath: string, content: string): WriteFileResult {
  const normalized = filePath.replace(/^\/+/, "").trim();
  if (!normalized) return { ok: false, path: filePath, error: "Path is required" };
  if (normalized.split("/").some((seg) => seg === "." || seg === "..")) {
    return { ok: false, path: filePath, error: "Path cannot contain '.' or '..' segments" };
  }
  if (ENV_FILE_PATTERN.test(normalized)) {
    return { ok: false, path: filePath, error: "Refusing to write a .env file — secrets are managed outside the file tree" };
  }
  if (typeof content !== "string") {
    return { ok: false, path: filePath, error: "content must be a string" };
  }

  const tree = setFileContentAtPath(root, normalized, content);
  return { ok: true, path: normalized, tree };
}

import type { TemplateFolder, TemplateItem } from "@/modules/playground/lib/path-to-json";
import { getFileDisplayName } from "@/modules/playground/lib";
import { isBinaryFileExtension } from "@/modules/playground/lib/binary-extensions";

/**
 * Read-only project-tree tools available to the agent (and, unmodified, to any
 * future non-autonomous chat-with-context mode) — operate purely on the
 * in-memory TemplateFolder already loaded for the run, no DB round-trip per
 * call. Mirrors the same tree shape write_file (file-tools.ts) mutates.
 */

// Kept small on purpose: Groq's on-demand TPM budget for this model is a hard
// 6000 tokens PER REQUEST, and every prior tool result gets resent on every
// subsequent call in the loop (see context-trim.ts, which handles the
// resend problem — these constants handle the "even one result is already
// too big" problem, confirmed live: an untrimmed ~320-line file alone pushed
// a single request to 14,274 tokens, 2.4x over budget, on turn 2).
const MAX_LIST_ENTRIES = 200;
const MAX_READ_LINES = 300;
const MAX_READ_CHARS = 4_000;
const MAX_SEARCH_MATCHES = 20;
const SEARCH_SNIPPET_RADIUS = 40;

function normalizeDirPath(dirPath?: string): string {
  return (dirPath ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
}

function findFolderAtPath(root: TemplateFolder, dirPath: string): TemplateFolder | null {
  if (!dirPath) return root;
  const segments = dirPath.split("/").filter(Boolean);
  let current: TemplateFolder = root;
  for (const segment of segments) {
    const next = current.items.find(
      (item): item is TemplateFolder => "folderName" in item && item.folderName === segment
    );
    if (!next) return null;
    current = next;
  }
  return current;
}

export interface ListFilesResult {
  path: string;
  entries: string[];
  truncated: boolean;
  error?: string;
}

/** Lists the immediate children of a directory ("name" for files, "name/" for folders) — not recursive, keeps output small enough for the model to page through a large project a directory at a time. */
export function listFiles(root: TemplateFolder, dirPath?: string): ListFilesResult {
  const normalized = normalizeDirPath(dirPath);
  const folder = findFolderAtPath(root, normalized);
  if (!folder) {
    return { path: normalized || "/", entries: [], truncated: false, error: `Directory not found: ${normalized || "/"}` };
  }
  const entries = folder.items
    .map((item) => ("folderName" in item ? `${item.folderName}/` : getFileDisplayName(item.filename, item.fileExtension)))
    .sort();
  return {
    path: normalized || "/",
    entries: entries.slice(0, MAX_LIST_ENTRIES),
    truncated: entries.length > MAX_LIST_ENTRIES,
  };
}

function findFileAtPath(root: TemplateFolder, filePath: string): { filename: string; fileExtension: string; content: string; encoding?: "base64" } | null {
  const segments = filePath.replace(/^\/+/, "").split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const targetName = segments[segments.length - 1];
  const folderSegments = segments.slice(0, -1);

  let current: TemplateFolder = root;
  for (const segment of folderSegments) {
    const next = current.items.find(
      (item): item is TemplateFolder => "folderName" in item && item.folderName === segment
    );
    if (!next) return null;
    current = next;
  }
  const file = current.items.find(
    (item): item is Extract<TemplateItem, { filename: string }> =>
      "filename" in item && getFileDisplayName(item.filename, item.fileExtension) === targetName
  );
  return file ?? null;
}

export interface ReadFileResult {
  path: string;
  content?: string;
  truncated?: boolean;
  error?: string;
}

export function readFile(root: TemplateFolder, filePath: string): ReadFileResult {
  const file = findFileAtPath(root, filePath);
  if (!file) return { path: filePath, error: `File not found: ${filePath}` };
  if (file.encoding === "base64" || isBinaryFileExtension(file.fileExtension)) {
    return { path: filePath, error: `${filePath} is a binary file and cannot be read as text` };
  }
  const fullContent = typeof file.content === "string" ? file.content : "";
  const lines = fullContent.split("\n");

  let content = fullContent;
  let truncated = false;

  if (lines.length > MAX_READ_LINES) {
    content = lines.slice(0, MAX_READ_LINES).join("\n");
    truncated = true;
  }
  // Safety net for the rare file with very long individual lines (e.g.
  // minified/generated code), where a line-count cap alone wouldn't bound size.
  if (content.length > MAX_READ_CHARS) {
    content = content.slice(0, MAX_READ_CHARS);
    truncated = true;
  }

  if (truncated) {
    content += `\n\n[…truncated: showing ${content.split("\n").length} of ${lines.length} lines. Use search_codebase to find specific content elsewhere in this file instead of re-reading it in full.]`;
  }

  return { path: filePath, content, truncated };
}

export interface SearchMatch {
  path: string;
  line: number;
  snippet: string;
}

export interface SearchCodebaseResult {
  query: string;
  matches: SearchMatch[];
  truncated: boolean;
}

/** Case-insensitive plain-substring search across every non-binary file in the tree. No regex — keeps this tool's contract simple and safe against a model passing an accidentally-catastrophic pattern. */
export function searchCodebase(root: TemplateFolder, query: string): SearchCodebaseResult {
  const matches: SearchMatch[] = [];
  const needle = query.toLowerCase();

  function walk(folder: TemplateFolder, prefix: string) {
    for (const item of folder.items) {
      if (matches.length >= MAX_SEARCH_MATCHES) return;
      if ("folderName" in item) {
        walk(item, prefix ? `${prefix}/${item.folderName}` : item.folderName);
        continue;
      }
      if (item.encoding === "base64" || isBinaryFileExtension(item.fileExtension)) continue;
      if (typeof item.content !== "string") continue;
      const path = prefix ? `${prefix}/${getFileDisplayName(item.filename, item.fileExtension)}` : getFileDisplayName(item.filename, item.fileExtension);
      const lines = item.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= MAX_SEARCH_MATCHES) return;
        const idx = lines[i].toLowerCase().indexOf(needle);
        if (idx === -1) continue;
        const start = Math.max(0, idx - SEARCH_SNIPPET_RADIUS);
        const end = Math.min(lines[i].length, idx + needle.length + SEARCH_SNIPPET_RADIUS);
        matches.push({ path, line: i + 1, snippet: (start > 0 ? "…" : "") + lines[i].slice(start, end) + (end < lines[i].length ? "…" : "") });
      }
    }
  }

  if (needle.trim().length > 0) walk(root, "");

  return { query, matches, truncated: matches.length >= MAX_SEARCH_MATCHES };
}

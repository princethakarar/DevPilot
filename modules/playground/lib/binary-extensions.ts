/**
 * File extensions (lowercase, no leading dot) treated as binary rather than
 * UTF-8 text. Shared by:
 *  - template scaffolding (path-to-json.ts) — read as base64 so a starter
 *    asset's bytes survive being stored as a JSON string
 *  - GitHub import (dashboard/actions/github.ts) — such files are skipped
 *    entirely rather than imported
 *  - GitHub push (playground/actions/commit.ts) — blobs are created with the
 *    matching `encoding` so the pushed bytes match the source file exactly
 *
 * Deliberately includes some text formats too (e.g. "svg", "lock") — treating
 * a text file as "binary" only means it round-trips through base64 instead of
 * being stored verbatim, which is always correct, just less human-readable in
 * the raw DB document. There's no correctness reason to be precise here.
 */
export const BINARY_FILE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "bmp", "ico", "svg", "webp", "avif",
  "mp3", "mp4", "wav", "ogg", "webm", "avi", "mov",
  "zip", "tar", "gz", "rar", "7z",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "woff", "woff2", "ttf", "eot", "otf",
  "exe", "dll", "so", "dylib",
  "pyc", "class", "o", "obj",
  "lock",
]);

export function isBinaryFileExtension(ext: string): boolean {
  return BINARY_FILE_EXTENSIONS.has(ext.toLowerCase());
}

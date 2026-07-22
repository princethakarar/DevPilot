/**
 * Single source of truth for the dependency-cache staleness window, shared by
 * both the read side (modules/webcontainers/lib/node-modules-persistence.ts,
 * used in the browser) and the write side (app/api/dependency-cache/blob-upload/route.ts,
 * used server-side to decide whether an existing Blob entry may be overwritten).
 * Kept in its own zero-dependency file so the server route never has to import
 * anything that touches browser-only globals (IndexedDB, etc.) just to reuse
 * this constant.
 */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isExpired(cachedAt: number): boolean {
  return Date.now() - cachedAt > MAX_AGE_MS;
}

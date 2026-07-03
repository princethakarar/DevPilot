import { get, set, del } from "idb-keyval";
import type { WebContainer, IFSWatcher, DirEnt } from "@webcontainer/api";

/**
 * Persists an installed node_modules tree to IndexedDB per (playgroundId, package.json hash)
 * so a full browser refresh — or reopening the playground shortly after — doesn't force a
 * fresh `npm install`. This is a WORKAROUND, not a true "keep the container alive" fix:
 * WebContainer has no API to reconnect to a previously-booted instance across a page reload
 * (the WASM VM and its whole in-memory filesystem are destroyed with the tab/page). See the
 * `useNodeModulesPersistence` hook for where this is wired into the boot flow, and the
 * playground page's summary notes for the tradeoffs.
 */

interface BundleEntry {
  path: string; // relative to node_modules/
  isDir: boolean;
  size: number; // 0 for directories
}

interface StoredBundle {
  entries: BundleEntry[];
  compressedData: Uint8Array;
  compressed: boolean; // false if CompressionStream wasn't available at capture time
  rawSize: number;
  cachedAt: number;
}

interface ManifestEntry {
  playgroundId: string;
  pkgHash: string;
  sizeBytes: number;
  cachedAt: number;
}

const STORE_PREFIX = "devpilot-nm-v1:";
const MANIFEST_KEY = "devpilot-nm-manifests-v1";
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;

function storeKey(playgroundId: string, pkgHash: string): string {
  return `${STORE_PREFIX}${playgroundId}:${pkgHash}`;
}

export async function computePackageJsonHash(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function gzip(data: Uint8Array): Promise<{ data: Uint8Array; compressed: boolean }> {
  if (typeof CompressionStream === "undefined") return { data, compressed: false };
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    return { data: new Uint8Array(buf), compressed: true };
  } catch {
    return { data, compressed: false };
  }
}

async function gunzip(data: Uint8Array, compressed: boolean): Promise<Uint8Array> {
  if (!compressed || typeof DecompressionStream === "undefined") return data;
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function concat(chunks: Uint8Array[], totalSize: number): Uint8Array {
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.byteLength;
  }
  return result;
}

async function walkDir(
  instance: WebContainer,
  dir: string,
  base: string,
  entries: BundleEntry[],
  chunks: Uint8Array[]
): Promise<void> {
  let items: DirEnt<string>[];
  try {
    items = await instance.fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  if (items.length === 0) {
    if (base) entries.push({ path: base, isDir: true, size: 0 });
    return;
  }

  for (const item of items) {
    const rel = base ? `${base}/${item.name}` : item.name;
    const full = `${dir}/${item.name}`;

    if (item.isDirectory?.()) {
      await walkDir(instance, full, rel, entries, chunks);
    } else if (item.isFile?.()) {
      try {
        const data = (await instance.fs.readFile(full)) as Uint8Array;
        entries.push({ path: rel, isDir: false, size: data.byteLength });
        chunks.push(data);
      } catch {
        // unreadable entry (broken symlink, etc.) — skip it, not fatal
      }
    }
  }
}

async function getManifest(): Promise<ManifestEntry[]> {
  try {
    return (await get<ManifestEntry[]>(MANIFEST_KEY)) ?? [];
  } catch {
    return [];
  }
}

async function getCachedNodeModules(playgroundId: string, pkgHash: string): Promise<StoredBundle | null> {
  try {
    return (await get<StoredBundle>(storeKey(playgroundId, pkgHash))) ?? null;
  } catch {
    return null;
  }
}

async function storeNodeModulesBundle(
  playgroundId: string,
  pkgHash: string,
  bundle: StoredBundle
): Promise<void> {
  try {
    const manifest = await getManifest();

    // Drop any older bundle cached for this same playground under a different
    // (now-stale) package.json hash.
    const stale = manifest.filter((m) => m.playgroundId === playgroundId && m.pkgHash !== pkgHash);
    for (const s of stale) {
      await del(storeKey(s.playgroundId, s.pkgHash)).catch(() => {});
    }

    await set(storeKey(playgroundId, pkgHash), bundle);

    const next = manifest.filter((m) => !(m.playgroundId === playgroundId && m.pkgHash !== pkgHash));
    const idx = next.findIndex((m) => m.playgroundId === playgroundId && m.pkgHash === pkgHash);
    const entry: ManifestEntry = {
      playgroundId,
      pkgHash,
      sizeBytes: bundle.compressedData.byteLength,
      cachedAt: Date.now(),
    };
    if (idx >= 0) next[idx] = entry;
    else next.push(entry);

    // Global LRU cap across all cached projects — a heavy template (e.g. Next.js,
    // ~300MB+ uncompressed node_modules) can evict older/smaller entries.
    next.sort((a, b) => a.cachedAt - b.cachedAt);
    let total = next.reduce((acc, m) => acc + m.sizeBytes, 0);
    while (total > MAX_TOTAL_BYTES && next.length > 1) {
      const oldest = next.shift()!;
      await del(storeKey(oldest.playgroundId, oldest.pkgHash)).catch(() => {});
      total -= oldest.sizeBytes;
    }

    await set(MANIFEST_KEY, next);
  } catch (err) {
    console.warn("[DevPilot] Failed to persist node_modules snapshot:", err);
  }
}

/**
 * Attempts to restore a previously-captured node_modules tree into the given,
 * freshly-mounted container. Returns true if it actually restored something.
 */
export async function tryRestoreNodeModules(
  instance: WebContainer,
  playgroundId: string,
  pkgHash: string
): Promise<boolean> {
  const cached = await getCachedNodeModules(playgroundId, pkgHash);
  if (!cached) return false;

  try {
    const raw = await gunzip(cached.compressedData, cached.compressed);
    let offset = 0;

    for (const entry of cached.entries) {
      const targetPath = `node_modules/${entry.path}`;

      if (entry.isDir) {
        await instance.fs.mkdir(targetPath, { recursive: true }).catch(() => {});
        continue;
      }

      const bytes = raw.subarray(offset, offset + entry.size);
      offset += entry.size;

      const parentDir = targetPath.split("/").slice(0, -1).join("/");
      if (parentDir) await instance.fs.mkdir(parentDir, { recursive: true }).catch(() => {});
      await instance.fs.writeFile(targetPath, bytes);
    }

    return true;
  } catch (err) {
    console.warn("[DevPilot] Failed to restore cached node_modules — falling back to a fresh install:", err);
    return false;
  }
}

/**
 * Walks the container's node_modules, bundles + gzips it, and persists it to
 * IndexedDB. No-ops (returns false) if npm hasn't actually finished installing —
 * detected via node_modules/.package-lock.json, which npm only (re)writes once
 * an install has fully settled, rather than trying to parse shell output.
 */
export async function captureAndStoreNodeModules(
  instance: WebContainer,
  playgroundId: string,
  pkgHash: string
): Promise<boolean> {
  try {
    await instance.fs.readFile("node_modules/.package-lock.json", "utf-8");
  } catch {
    return false;
  }

  const entries: BundleEntry[] = [];
  const chunks: Uint8Array[] = [];
  await walkDir(instance, "node_modules", "", entries, chunks);
  if (entries.length === 0) return false;

  const totalSize = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const raw = concat(chunks, totalSize);
  const { data: compressedData, compressed } = await gzip(raw);

  await storeNodeModulesBundle(playgroundId, pkgHash, {
    entries,
    compressedData,
    compressed,
    rawSize: totalSize,
    cachedAt: Date.now(),
  });

  return true;
}

/**
 * Watches the project tree for changes under node_modules and fires `onSettled`
 * after `debounceMs` of quiet — i.e. once an install (or similar bulk write) has
 * finished, not mid-write. Returns an unsubscribe function.
 */
export function watchForInstallCompletion(
  instance: WebContainer,
  onSettled: () => void,
  debounceMs = 4000
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watcher: IFSWatcher | null = null;

  try {
    watcher = instance.fs.watch("", { recursive: true }, (_event, filename) => {
      const name = typeof filename === "string" ? filename : "";
      if (!name.includes("node_modules")) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(onSettled, debounceMs);
    });
  } catch (err) {
    console.warn("[DevPilot] fs.watch unavailable — node_modules auto-capture disabled:", err);
  }

  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}

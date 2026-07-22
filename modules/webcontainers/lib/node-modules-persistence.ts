import { get, set, del } from "idb-keyval";
import type { WebContainer, IFSWatcher, DirEnt } from "@webcontainer/api";
import { isExpired } from "@/lib/dependency-cache-ttl";

/**
 * Regenerates node_modules/.bin (at any depth, including nested per-package
 * node_modules) from each installed package's package.json#bin field.
 *
 * Runs as a spawned Node script rather than through instance.fs.* because the
 * browser-side FileSystemAPI exposes no symlink()/chmod() at all (confirmed
 * against @webcontainer/api's own type defs) — only a real Node process
 * running inside the container has those. A real `npm install` running in
 * this same container already proves symlinks work at that layer (it's how
 * .bin gets populated in the first place); this script just uses the same
 * underlying capability to rebuild what the bundle format couldn't capture.
 *
 * Confirmed empirically (not assumed) that this chmod is required: a file
 * written via instance.fs.writeFile lands at mode 664, while a real npm
 * install's bin target script is 775. Without the explicit chmod below, the
 * regenerated symlink would exist and point to the right place, but running
 * it would fail with EACCES — looking correct right up until it's actually
 * invoked.
 */
const REGENERATE_BIN_SCRIPT = `
const fs = require("fs");
const path = require("path");

const ROOT = process.argv[2] || "node_modules";

function findNodeModulesDirs(dir, results) {
  results.push(dir);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".bin" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith("@")) {
      let scopedEntries;
      try {
        scopedEntries = fs.readdirSync(full, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const scoped of scopedEntries) {
        if (!scoped.isDirectory()) continue;
        const nested = path.join(full, scoped.name, "node_modules");
        if (fs.existsSync(nested)) findNodeModulesDirs(nested, results);
      }
      continue;
    }
    const nested = path.join(full, "node_modules");
    if (fs.existsSync(nested)) findNodeModulesDirs(nested, results);
  }
}

function listPackageDirs(nodeModulesDir) {
  const pkgDirs = [];
  let entries;
  try {
    entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });
  } catch {
    return pkgDirs;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".bin" || entry.name.startsWith(".")) continue;
    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(nodeModulesDir, entry.name);
      let scopedEntries;
      try {
        scopedEntries = fs.readdirSync(scopeDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const scoped of scopedEntries) {
        if (scoped.isDirectory()) pkgDirs.push(path.join(scopeDir, scoped.name));
      }
      continue;
    }
    pkgDirs.push(path.join(nodeModulesDir, entry.name));
  }
  return pkgDirs;
}

function regenerateBinDir(nodeModulesDir) {
  let created = 0;
  for (const pkgDir of listPackageDirs(nodeModulesDir)) {
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (!pkg.bin) continue;

    let binMap;
    if (typeof pkg.bin === "string") {
      const name = pkg.name ? pkg.name.split("/").pop() : null;
      if (!name) continue;
      binMap = { [name]: pkg.bin };
    } else if (typeof pkg.bin === "object") {
      binMap = pkg.bin;
    } else {
      continue;
    }

    for (const [binName, relScript] of Object.entries(binMap)) {
      if (!binName || !relScript) continue;
      const targetScript = path.join(pkgDir, relScript);
      if (!fs.existsSync(targetScript)) continue;

      try {
        fs.chmodSync(targetScript, 0o755);
      } catch {
        // non-fatal — still attempt the symlink below
      }

      const binDir = path.join(nodeModulesDir, ".bin");
      try {
        fs.mkdirSync(binDir, { recursive: true });
        const linkPath = path.join(binDir, binName);
        if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath);
        fs.symlinkSync(path.relative(binDir, targetScript), linkPath);
        created++;
      } catch {
        // non-fatal — this one bin entry stays missing; checkForPartialInstall
        // will still catch an overall-still-broken .bin and force a real repair
      }
    }
  }
  return created;
}

const allNodeModulesDirs = [];
findNodeModulesDirs(ROOT, allNodeModulesDirs);

let totalCreated = 0;
for (const dir of allNodeModulesDirs) {
  totalCreated += regenerateBinDir(dir);
}

process.stdout.write(JSON.stringify({ done: true, regenerated: totalCreated, scanned: allNodeModulesDirs.length }) + "\\n");
`.trim();

async function regenerateBinLinks(instance: WebContainer): Promise<number> {
  // Relative, not absolute — confirmed empirically (not assumed) that a
  // leading "/" here breaks the spawned node process's module resolution:
  // instance.fs.writeFile("/foo") and a spawned `node` process both accept
  // that path, but they don't necessarily agree on what root it resolves
  // against, and in practice the spawned process failed with MODULE_NOT_FOUND
  // against an absolute path that instance.fs had just written successfully.
  // Relative-to-cwd paths worked correctly in that same test.
  const scriptPath = ".devpilot/regenerate-bin.js";

  try {
    await instance.fs.mkdir(".devpilot", { recursive: true });
    await instance.fs.writeFile(scriptPath, REGENERATE_BIN_SCRIPT);

    const proc = await instance.spawn("node", [scriptPath, "node_modules"]);

    let output = "";
    await proc.output.pipeTo(
      new WritableStream({
        write(chunk) {
          output += chunk;
        },
      })
    );

    const exitCode = await proc.exit;

    try {
      await instance.fs.rm(scriptPath);
    } catch {}

    if (exitCode !== 0) {
      console.warn("[DevPilot] .bin regeneration script exited non-zero:", exitCode, output);
      return 0;
    }

    const match = output.match(/\{.*"done"\s*:\s*true.*\}/);
    if (!match) return 0;

    const parsed = JSON.parse(match[0]) as { regenerated: number; scanned: number };
    return parsed.regenerated;
  } catch (err) {
    console.warn("[DevPilot] .bin regeneration failed (non-fatal, restore may still need a real install):", err);
    return 0;
  }
}

/**
 * Persists an installed node_modules tree to IndexedDB keyed ONLY on the
 * package.json content hash (not per-playground), so a full browser refresh —
 * or opening a brand new playground that happens to share the same dependency
 * set as one already installed — doesn't force a fresh `npm install`. Keying
 * on the hash alone (rather than (playgroundId, hash)) is what lets two
 * different playgrounds built from the same starter template share one cached
 * bundle instead of each paying the install cost separately.
 * This is a WORKAROUND, not a true "keep the container alive" fix:
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
  pkgHash: string;
  sizeBytes: number;
  cachedAt: number;
}

const STORE_PREFIX = "devpilot-nm-v1:";
const MANIFEST_KEY = "devpilot-nm-manifests-v1";
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;

// The cache key is SHA-256(package.json) only — package-lock.json is stripped
// before a template ever reaches this module (see path-to-json.ts's
// ignoreFiles), so a semver range like `react: ^18.0.0` can resolve to a newer
// patch release than whatever got captured under this key. Bound that
// staleness window with the same 7-day maxAge lib/snapshot/cache.ts's
// (unused) clearExpiredSnapshots already uses, rather than inventing a new
// number. Checked at read time on every lookup — an expired entry is simply
// treated as a miss, no background sweep.
// (MAX_AGE_MS / isExpired now live in lib/dependency-cache-ttl.ts — shared
// with the server-side write-gate in blob-upload/route.ts, see that file.)

// Level 2 — Vercel Blob-backed cache, shared across users. Same cache key and
// bundle shape as the IndexDB (Level 1) store above, just given a CDN backing.
// Both env vars are unset in environments where the Blob store hasn't been
// provisioned yet — every function below no-ops (fails open) in that case.
const BLOB_BASE_URL = process.env.NEXT_PUBLIC_BLOB_BASE_URL;

function storeKey(pkgHash: string): string {
  return `${STORE_PREFIX}${pkgHash}`;
}

function blobPathname(pkgHash: string): string {
  return `node-modules/${pkgHash}.bin`;
}

/**
 * Frames a StoredBundle as a single self-contained blob so a Level 2 read is
 * one HTTPS GET: [4-byte LE header length][JSON header][compressed payload].
 */
function encodeBundleForBlob(bundle: StoredBundle): Uint8Array {
  const header = JSON.stringify({
    entries: bundle.entries,
    compressed: bundle.compressed,
    rawSize: bundle.rawSize,
    // The original capture time, NOT upload time — this is what lets a
    // consumer's TTL check reflect how old the underlying packages actually
    // are, not how recently this blob happened to get (re)written.
    cachedAt: bundle.cachedAt,
  });
  const headerBytes = new TextEncoder().encode(header);

  const out = new Uint8Array(4 + headerBytes.byteLength + bundle.compressedData.byteLength);
  new DataView(out.buffer).setUint32(0, headerBytes.byteLength, true);
  out.set(headerBytes, 4);
  out.set(bundle.compressedData, 4 + headerBytes.byteLength);
  return out;
}

function decodeBundleFromBlob(bytes: Uint8Array): StoredBundle {
  const headerLen = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
  const headerBytes = bytes.subarray(4, 4 + headerLen);
  const header = JSON.parse(new TextDecoder().decode(headerBytes)) as {
    entries: BundleEntry[];
    compressed: boolean;
    rawSize: number;
    cachedAt: number;
  };

  return {
    entries: header.entries,
    compressedData: bytes.subarray(4 + headerLen),
    compressed: header.compressed,
    rawSize: header.rawSize,
    cachedAt: header.cachedAt,
  };
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

async function deleteCachedNodeModules(pkgHash: string): Promise<void> {
  try {
    await del(storeKey(pkgHash));
    const manifest = await getManifest();
    await set(MANIFEST_KEY, manifest.filter((m) => m.pkgHash !== pkgHash));
  } catch {
    // best-effort — a leftover expired entry just gets re-checked (and
    // re-expired) next lookup, it doesn't get served
  }
}

async function getCachedNodeModules(pkgHash: string): Promise<StoredBundle | null> {
  try {
    const bundle = (await get<StoredBundle>(storeKey(pkgHash))) ?? null;
    if (!bundle) return null;

    if (isExpired(bundle.cachedAt)) {
      await deleteCachedNodeModules(pkgHash);
      return null;
    }

    return bundle;
  } catch {
    return null;
  }
}

async function storeNodeModulesBundle(
  pkgHash: string,
  bundle: StoredBundle
): Promise<void> {
  try {
    const manifest = await getManifest();

    await set(storeKey(pkgHash), bundle);

    const next = manifest.filter((m) => m.pkgHash !== pkgHash);
    const entry: ManifestEntry = {
      pkgHash,
      sizeBytes: bundle.compressedData.byteLength,
      cachedAt: Date.now(),
    };
    next.push(entry);

    // Global LRU cap across all cached dependency sets — a heavy template (e.g.
    // Next.js, ~300MB+ uncompressed node_modules) can evict older/smaller entries.
    next.sort((a, b) => a.cachedAt - b.cachedAt);
    let total = next.reduce((acc, m) => acc + m.sizeBytes, 0);
    while (total > MAX_TOTAL_BYTES && next.length > 1) {
      const oldest = next.shift()!;
      await del(storeKey(oldest.pkgHash)).catch(() => {});
      total -= oldest.sizeBytes;
    }

    await set(MANIFEST_KEY, next);
  } catch (err) {
    console.warn("[DevPilot] Failed to persist node_modules snapshot:", err);
  }
}

async function restoreBundleIntoContainer(
  instance: WebContainer,
  cached: StoredBundle
): Promise<void> {
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

  // Awaited here, inside restoreBundleIntoContainer itself — not fired off
  // alongside it — so both tryRestoreNodeModules and tryRestoreFromBlob only
  // resolve once regeneration has fully finished one way or another. The
  // caller's subsequent checkForPartialInstall call can then never race
  // ahead of this: by construction there is no in-flight state left for it
  // to observe partway through.
  await regenerateBinLinks(instance);
}

/**
 * Attempts to restore a previously-captured node_modules tree into the given,
 * freshly-mounted container. Returns true if it actually restored something.
 * Since the cache is keyed only on the package.json hash, this also fires for
 * a brand new playground that happens to share the exact same dependency set
 * as one already installed elsewhere — not just a reopen of the same playground.
 */
export async function tryRestoreNodeModules(
  instance: WebContainer,
  pkgHash: string
): Promise<boolean> {
  const cached = await getCachedNodeModules(pkgHash);
  if (!cached) return false;

  try {
    await restoreBundleIntoContainer(instance, cached);
    return true;
  } catch (err) {
    console.warn("[DevPilot] Failed to restore cached node_modules — falling back to a fresh install:", err);
    return false;
  }
}

/**
 * Level 2 — checks the shared Vercel Blob cache for the same pkgHash key used
 * by Level 1. Only called after an IndexDB miss. Any failure (store not
 * provisioned, network error, bad/missing blob, decode error, or the entry
 * having aged past MAX_AGE_MS) fails open by returning false — the caller
 * falls through to a real npm install exactly as if Level 2 didn't exist. On
 * a fresh hit, also feeds Level 1 so this browser gets a local hit next time
 * without needing the network at all — using the blob's original cachedAt so
 * Level 1's own TTL check stays honest instead of getting reset to "now".
 */
export async function tryRestoreFromBlob(
  instance: WebContainer,
  pkgHash: string
): Promise<boolean> {
  if (!BLOB_BASE_URL) return false;

  try {
    const res = await fetch(`${BLOB_BASE_URL}/${blobPathname(pkgHash)}`);
    if (!res.ok) return false;

    const bundle = decodeBundleFromBlob(new Uint8Array(await res.arrayBuffer()));
    if (isExpired(bundle.cachedAt)) return false;

    await restoreBundleIntoContainer(instance, bundle);

    storeNodeModulesBundle(pkgHash, bundle).catch(() => {});

    return true;
  } catch (err) {
    console.warn("[DevPilot] Blob cache read failed, falling back:", err);
    return false;
  }
}

/**
 * Walks the container's node_modules, bundles + gzips it, and persists it to
 * IndexedDB. No-ops (returns null) if npm hasn't actually finished installing —
 * detected via node_modules/.package-lock.json, which npm only (re)writes once
 * an install has fully settled, rather than trying to parse shell output.
 * Returns the captured bundle (rather than just a bool) so a Level 2 upload
 * can reuse the already-walked/gzipped bytes instead of re-walking the tree.
 */
export async function captureAndStoreNodeModules(
  instance: WebContainer,
  pkgHash: string
): Promise<StoredBundle | null> {
  try {
    await instance.fs.readFile("node_modules/.package-lock.json", "utf-8");
  } catch {
    return null;
  }

  const entries: BundleEntry[] = [];
  const chunks: Uint8Array[] = [];
  await walkDir(instance, "node_modules", "", entries, chunks);
  if (entries.length === 0) return null;

  const totalSize = chunks.reduce((acc, c) => acc + c.byteLength, 0);
  const raw = concat(chunks, totalSize);
  const { data: compressedData, compressed } = await gzip(raw);

  const bundle: StoredBundle = {
    entries,
    compressedData,
    compressed,
    rawSize: totalSize,
    cachedAt: Date.now(),
  };

  await storeNodeModulesBundle(pkgHash, bundle);

  return bundle;
}

/**
 * Level 2 write-back — fires after a genuine Level 3 (npm) install just
 * populated Level 1, so the next user who misses Level 1 gets a CDN hit
 * instead of a slow npm download. Uses Vercel Blob's client-upload flow (a
 * short-lived token is minted by /api/dependency-cache/blob-upload) so the
 * bundle bytes — tens of MB for a real template — go straight from this
 * browser to Blob storage without passing through a serverless function body
 * limit. Deterministic pathname + allowOverwrite means two users racing to
 * fill the same key just harmlessly overwrite one another — no locking.
 * Never throws: a failed upload must not affect the install that already
 * succeeded.
 */
export async function uploadNodeModulesToBlob(
  pkgHash: string,
  bundle: StoredBundle
): Promise<void> {
  if (!BLOB_BASE_URL) return;

  try {
    const { upload } = await import("@vercel/blob/client");
    const payload = encodeBundleForBlob(bundle);

    await upload(blobPathname(pkgHash), new Blob([payload as BlobPart]), {
      access: "public",
      handleUploadUrl: "/api/dependency-cache/blob-upload",
      contentType: "application/octet-stream",
      multipart: true,
    });

    console.info("[DevPilot] Cached node_modules to CDN (Blob) for future installs.");
  } catch (err) {
    console.warn("[DevPilot] Failed to upload node_modules to Blob cache (non-fatal):", err);
  }
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

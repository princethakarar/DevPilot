import { get, set, del } from "idb-keyval";
import type { WebContainer, IFSWatcher, DirEnt } from "@webcontainer/api";
import { isExpired } from "@/lib/dependency-cache-ttl";
import {
  depLog,
  depWarn,
  depTimer,
  formatBytes,
  mapWithConcurrency,
} from "@/lib/dep-cache-debug";

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
  // .cjs extension forces Node to treat this as CommonJS regardless of the
  // template's package.json "type" field — templates with "type":"module"
  // cause Node to reject require() in a plain .js file with ESM scope errors.
  const scriptPath = ".devpilot/regenerate-bin.cjs";

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

/**
 * Progress for the phases that are slow enough to look like a hang on a large
 * tree. Counts are in FILES, not packages: the nextjs starter is 398 packages
 * but 17,303 files, and every cost in this pipeline scales with the latter, so
 * reporting packages would show a progress bar that sits still for minutes.
 */
export interface DepCacheProgress {
  phase: "walking" | "reading" | "restoring" | "installing" | "uploading";
  completed: number;
  total: number;
  message: string;
}

export type DepCacheProgressCallback = (progress: DepCacheProgress) => void;

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

async function sha256Hex(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computePackageJsonHash(content: string): Promise<string> {
  return sha256Hex(content);
}

/**
 * The dependency-cache key, for every tier (IndexedDB, Blob, warm-cache script).
 *
 * Now that templates ship their package-lock.json (see path-to-json.ts), the
 * lockfile is folded into the key. That's what makes cross-machine hits
 * genuinely safe: `package.json` alone says `react: ^18.0.0`, which resolved
 * to different exact versions in March and in July, so two machines could
 * legitimately compute the same key for materially different trees. The
 * lockfile pins the exact resolved version of every transitive dependency, so
 * matching keys now imply matching trees.
 *
 * Templates with no lockfile fall back to package.json only — same key as
 * before, and the 7-day TTL in lib/dependency-cache-ttl.ts remains the only
 * bound on staleness for those.
 *
 * IMPORTANT: this must be computed from the TEMPLATE's files, not the
 * container's, and the same way in every caller. npm rewrites
 * package-lock.json in place during an install (normalising it, filling in
 * integrity fields), so hashing the post-install lockfile would store every
 * bundle under a key that no lookup ever computes — a cache that writes
 * perfectly and never reads.
 */
export async function computeDependencyCacheKey(
  packageJson: string,
  packageLockJson: string | null
): Promise<string> {
  if (!packageLockJson) return sha256Hex(packageJson);
  return sha256Hex(`${packageJson}\n--devpilot-lock--\n${packageLockJson}`);
}

// Concurrency caps for the WebContainer virtual filesystem. Deliberately
// SEPARATE from npm's --maxsockets (lib/snapshot/loader.ts): that one bounds
// outbound network sockets and is tuned against sandbox OOM kills, whereas
// these bound in-flight WASM VFS syscalls and hold file contents in JS memory
// while in flight. Conflating them would mean an OOM-driven drop to
// maxsockets=1 also crippling local file I/O, which has nothing to do with
// the network pressure that triggered it.
//
// Reads are capped lower than writes because a read materialises the file's
// full contents in the heap and holds it until the batch drains; a write hands
// its buffer straight to the VFS.
const VFS_READ_CONCURRENCY = 12;
const VFS_WRITE_CONCURRENCY = 16;

/**
 * Pulls exactly-N-byte slices out of a byte stream.
 *
 * Restore needs this because the bundle payload is a headerless concatenation:
 * entry sizes in the header say how many bytes belong to each file, so the
 * consumer has to cut the decompressed stream at arbitrary offsets that don't
 * line up with the decompressor's own chunk boundaries. Reading incrementally
 * is the entire point — the previous implementation decompressed the whole
 * tree into one contiguous Uint8Array first (~279MB for nextjs) before writing
 * a single file.
 */
class ByteStreamReader {
  private pending: Uint8Array[] = [];
  private buffered = 0;
  private exhausted = false;

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async read(n: number): Promise<Uint8Array> {
    if (n === 0) return new Uint8Array(0);

    while (this.buffered < n && !this.exhausted) {
      const { done, value } = await this.reader.read();
      if (done) {
        this.exhausted = true;
        break;
      }
      if (value && value.byteLength > 0) {
        this.pending.push(value);
        this.buffered += value.byteLength;
      }
    }

    const take = Math.min(n, this.buffered);
    const out = new Uint8Array(take);
    let written = 0;

    while (written < take) {
      const head = this.pending[0];
      const need = take - written;

      if (head.byteLength <= need) {
        out.set(head, written);
        written += head.byteLength;
        this.pending.shift();
      } else {
        out.set(head.subarray(0, need), written);
        this.pending[0] = head.subarray(need);
        written += need;
      }
    }

    this.buffered -= take;
    return out;
  }

  async cancel(): Promise<void> {
    try {
      await this.reader.cancel();
    } catch {
      // already closed/errored — nothing to release
    }
  }
}

function openBundlePayload(bundle: StoredBundle): ByteStreamReader {
  const source = new Blob([bundle.compressedData as BlobPart]).stream();
  const bytes =
    bundle.compressed && typeof DecompressionStream !== "undefined"
      ? source.pipeThrough(new DecompressionStream("gzip"))
      : source;
  return new ByteStreamReader(bytes.getReader() as ReadableStreamDefaultReader<Uint8Array>);
}

interface WalkedTree {
  /** Paths relative to node_modules/, in the order their bytes appear in the payload. */
  filePaths: string[];
  /** Directories that contain nothing — the only dirs the bundle must record explicitly. */
  emptyDirs: string[];
}

/**
 * Enumerates the tree WITHOUT reading any file contents.
 *
 * Split from the read phase so the read phase can stream: knowing every path
 * up front is what lets capture feed the compressor incrementally instead of
 * buffering every file to compute a total size first. (WebContainer's fs has
 * no stat(), so sizes still can't be known until each file is actually read —
 * they're recorded during streaming instead, see captureBundle.)
 *
 * Directory listings run concurrently level-by-level; a deep nested
 * node_modules is wide but shallow, so BFS parallelism helps a lot here.
 */
async function walkTree(instance: WebContainer, root: string): Promise<WalkedTree> {
  const filePaths: string[] = [];
  const emptyDirs: string[] = [];

  let frontier: { dir: string; base: string }[] = [{ dir: root, base: "" }];

  while (frontier.length > 0) {
    const listings = await mapWithConcurrency(frontier, VFS_READ_CONCURRENCY, async (node) => {
      let items: DirEnt<string>[];
      try {
        items = await instance.fs.readdir(node.dir, { withFileTypes: true });
      } catch {
        return { node, items: [] as DirEnt<string>[], unreadable: true };
      }
      return { node, items, unreadable: false };
    });

    const next: { dir: string; base: string }[] = [];

    for (const { node, items, unreadable } of listings) {
      if (unreadable) continue;

      if (items.length === 0) {
        if (node.base) emptyDirs.push(node.base);
        continue;
      }

      for (const item of items) {
        const rel = node.base ? `${node.base}/${item.name}` : item.name;
        const full = `${node.dir}/${item.name}`;

        if (item.isDirectory?.()) {
          next.push({ dir: full, base: rel });
        } else if (item.isFile?.()) {
          filePaths.push(rel);
        }
        // Anything else (symlinks — notably node_modules/.bin/*) is skipped:
        // the bundle format can't represent them. regenerateBinLinks rebuilds
        // .bin from each package's package.json#bin after a restore.
      }
    }

    frontier = next;
  }

  return { filePaths, emptyDirs };
}

/**
 * Reads every file and streams it straight into gzip, never holding the whole
 * uncompressed tree in memory.
 *
 * This replaces a build-an-array-of-every-file-then-concat()-then-gzip()
 * pipeline whose peak allocation was ~2x the raw tree — about 560MB for the
 * nextjs starter (17,303 files / 279MB), which is the most likely reason the
 * Blob tier was never getting populated for Next.js at all: the tab would be
 * pushed to (or over) its heap limit right at capture time, so the upload that
 * every later cache hit depends on simply never happened.
 *
 * Entry sizes are recorded here rather than up front because WebContainer's fs
 * exposes no stat() — the size of a file isn't knowable until it's read. That
 * forces one ordering constraint: `entries` must be appended in exactly the
 * order bytes are enqueued, since restore replays them positionally.
 */
async function captureBundle(
  instance: WebContainer,
  tree: WalkedTree,
  onProgress?: DepCacheProgressCallback
): Promise<{ entries: BundleEntry[]; compressedData: Uint8Array; compressed: boolean; rawSize: number }> {
  const entries: BundleEntry[] = tree.emptyDirs.map((path) => ({ path, isDir: true, size: 0 }));

  // Decided BEFORE the stream is consumed, never mid-flight: a ReadableStream
  // can't be replayed, so a compressor that fails halfway leaves `entries`
  // half-populated with no way to retry. Better to fail the capture outright
  // than to persist a bundle whose header disagrees with its payload.
  const useCompression = typeof CompressionStream !== "undefined";
  if (!useCompression) {
    depWarn("CompressionStream unavailable — capturing uncompressed (larger cache entry).");
  }

  let rawSize = 0;
  let filesRead = 0;
  let cursor = 0;

  const source = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cursor >= tree.filePaths.length) {
        controller.close();
        return;
      }

      const batch = tree.filePaths.slice(cursor, cursor + VFS_READ_CONCURRENCY);
      cursor += batch.length;

      const datas = await Promise.all(
        batch.map(async (rel) => {
          try {
            return (await instance.fs.readFile(`node_modules/${rel}`)) as Uint8Array;
          } catch {
            // Unreadable entry (broken symlink, race with a concurrent write).
            // Omitted from BOTH header and payload so the two stay in sync.
            return null;
          }
        })
      );

      for (let i = 0; i < batch.length; i++) {
        const data = datas[i];
        if (!data) continue;
        entries.push({ path: batch[i], isDir: false, size: data.byteLength });
        rawSize += data.byteLength;
        filesRead++;
        controller.enqueue(data);
      }

      onProgress?.({
        phase: "reading",
        completed: cursor,
        total: tree.filePaths.length,
        message: `Packaging dependencies — ${cursor}/${tree.filePaths.length} files`,
      });
    },
  });

  // CompressionStream's lib.dom typing declares its writable side as
  // WritableStream<BufferSource>, which isn't assignable from
  // ReadableStream<Uint8Array> under strict variance even though every value
  // we enqueue is a valid BufferSource. Cast the transform, not the data.
  const piped = useCompression
    ? source.pipeThrough(
        new CompressionStream("gzip") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
      )
    : source;

  const compressedData = new Uint8Array(await new Response(piped).arrayBuffer());

  depLog("capture: packaged tree", {
    files: filesRead,
    emptyDirs: tree.emptyDirs.length,
    raw: formatBytes(rawSize),
    stored: formatBytes(compressedData.byteLength),
    ratio: rawSize > 0 ? `${((compressedData.byteLength / rawSize) * 100).toFixed(1)}%` : "n/a",
  });

  return { entries, compressedData, compressed: useCompression, rawSize };
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
  cached: StoredBundle,
  onProgress?: DepCacheProgressCallback
): Promise<void> {
  const done = depTimer("restore: write tree into container");
  const payload = openBundlePayload(cached);

  try {
    // Phase 1 — every directory, deduped, up front.
    //
    // The old loop issued a recursive mkdir for each file's parent, i.e. one
    // per file (~17k for nextjs) where the tree only has a few thousand
    // distinct directories. Deduping first turns almost all of those into
    // nothing, and lets the survivors run concurrently.
    const dirs = new Set<string>();
    for (const entry of cached.entries) {
      if (entry.isDir) {
        dirs.add(`node_modules/${entry.path}`);
        continue;
      }
      const parent = `node_modules/${entry.path}`.split("/").slice(0, -1).join("/");
      if (parent) dirs.add(parent);
    }

    await mapWithConcurrency([...dirs], VFS_WRITE_CONCURRENCY, async (dir) => {
      await instance.fs.mkdir(dir, { recursive: true }).catch(() => {});
    });

    depLog("restore: created directories", { count: dirs.size });

    // Phase 2 — file contents.
    //
    // Bytes must be pulled from the payload strictly in entry order (it's a
    // single concatenated stream), but the WRITES don't have to be serialised
    // the way they were before. So: read a batch's worth sequentially from the
    // decompressor (cheap, in-memory), then issue that batch's writes
    // concurrently against the VFS (expensive). ~34k sequential awaits becomes
    // ~17k stream reads plus ~1.1k parallel write batches.
    const fileEntries = cached.entries.filter((e) => !e.isDir);
    let written = 0;

    for (let i = 0; i < fileEntries.length; i += VFS_WRITE_CONCURRENCY) {
      const batch = fileEntries.slice(i, i + VFS_WRITE_CONCURRENCY);

      const withBytes: { path: string; bytes: Uint8Array }[] = [];
      for (const entry of batch) {
        const bytes = await payload.read(entry.size);
        if (bytes.byteLength !== entry.size) {
          // Header and payload disagree — a truncated or corrupt bundle. Bail
          // instead of writing half a dependency tree that would then fail
          // checkForPartialInstall in a much more confusing way.
          throw new Error(
            `Bundle payload truncated at ${entry.path}: expected ${entry.size} bytes, got ${bytes.byteLength}`
          );
        }
        withBytes.push({ path: `node_modules/${entry.path}`, bytes });
      }

      await Promise.all(
        withBytes.map(({ path, bytes }) => instance.fs.writeFile(path, bytes))
      );

      written += batch.length;
      onProgress?.({
        phase: "restoring",
        completed: written,
        total: fileEntries.length,
        message: `Restoring cached dependencies — ${written}/${fileEntries.length} files`,
      });
    }

    done({ files: written, dirs: dirs.size });
  } finally {
    await payload.cancel();
  }

  // Awaited here, inside restoreBundleIntoContainer itself — not fired off
  // alongside it — so both tryRestoreNodeModules and tryRestoreFromBlob only
  // resolve once regeneration has fully finished one way or another. The
  // caller's subsequent checkForPartialInstall call can then never race
  // ahead of this: by construction there is no in-flight state left for it
  // to observe partway through.
  const binsDone = depTimer("restore: regenerate .bin symlinks");
  const regenerated = await regenerateBinLinks(instance);
  binsDone({ regenerated });
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
  pkgHash: string,
  onProgress?: DepCacheProgressCallback
): Promise<boolean> {
  const cached = await getCachedNodeModules(pkgHash);
  if (!cached) {
    depLog("L1 IndexedDB: miss", { pkgHash: pkgHash.slice(0, 12) });
    return false;
  }

  depLog("L1 IndexedDB: hit", {
    pkgHash: pkgHash.slice(0, 12),
    stored: formatBytes(cached.compressedData.byteLength),
    files: cached.entries.length,
    ageHours: ((Date.now() - cached.cachedAt) / 3_600_000).toFixed(1),
  });

  try {
    await restoreBundleIntoContainer(instance, cached, onProgress);
    return true;
  } catch (err) {
    depWarn("L1 restore failed — falling back to a fresh install:", err);
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
  pkgHash: string,
  onProgress?: DepCacheProgressCallback
): Promise<boolean> {
  if (!BLOB_BASE_URL) {
    depWarn("L2 Blob: NEXT_PUBLIC_BLOB_BASE_URL is unset — CDN cache tier is disabled entirely.");
    return false;
  }

  const url = `${BLOB_BASE_URL}/${blobPathname(pkgHash)}`;

  try {
    const fetchDone = depTimer("L2 Blob: download");
    const res = await fetch(url);

    if (!res.ok) {
      // 404 is the ordinary cold-cache case and stays quiet at info level;
      // anything else means the tier is misconfigured or erroring, which
      // previously looked identical to a plain miss from the outside.
      if (res.status === 404) {
        depLog("L2 Blob: miss (404)", { pkgHash: pkgHash.slice(0, 12) });
      } else {
        depWarn(`L2 Blob: unexpected status ${res.status} — treating as miss.`, { url });
      }
      return false;
    }

    const raw = new Uint8Array(await res.arrayBuffer());
    fetchDone({ bytes: formatBytes(raw.byteLength) });

    const bundle = decodeBundleFromBlob(raw);
    if (isExpired(bundle.cachedAt)) {
      depLog("L2 Blob: hit but expired — falling through to npm", {
        ageHours: ((Date.now() - bundle.cachedAt) / 3_600_000).toFixed(1),
      });
      return false;
    }

    depLog("L2 Blob: hit", {
      pkgHash: pkgHash.slice(0, 12),
      files: bundle.entries.length,
      stored: formatBytes(bundle.compressedData.byteLength),
    });

    await restoreBundleIntoContainer(instance, bundle, onProgress);

    storeNodeModulesBundle(pkgHash, bundle).catch(() => {});

    return true;
  } catch (err) {
    depWarn("L2 Blob read failed, falling back:", err);
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
/**
 * Guards against two captures of the same tree running at once.
 *
 * The trigger is an fs.watch debounce, and a single boot can legitimately
 * write node_modules more than once — the OOM fallback's serialised retry does
 * exactly that, and was observed starting a second capture 12s into the first.
 * Two concurrent walk+gzip passes over a 400MB tree double both the memory
 * and the CPU cost for a bundle that is identical either way.
 */
const capturesInFlight = new Set<string>();

export async function captureAndStoreNodeModules(
  instance: WebContainer,
  pkgHash: string,
  expectedPackageJson: string,
  onProgress?: DepCacheProgressCallback
): Promise<StoredBundle | null> {
  // Claimed synchronously, before the first await. Checking here but adding
  // after the readFile below would let two callers in the same tick both pass
  // the check and both proceed — which is precisely the interleaving the
  // fs.watch debounce produces.
  if (capturesInFlight.has(pkgHash)) {
    depLog("capture: skipped — one is already in flight for this key", {
      pkgHash: pkgHash.slice(0, 12),
    });
    return null;
  }
  capturesInFlight.add(pkgHash);

  try {
    return await captureAndStoreInner(instance, pkgHash, expectedPackageJson, onProgress);
  } finally {
    capturesInFlight.delete(pkgHash);
  }
}

async function captureAndStoreInner(
  instance: WebContainer,
  pkgHash: string,
  expectedPackageJson: string,
  onProgress?: DepCacheProgressCallback
): Promise<StoredBundle | null> {
  try {
    await instance.fs.readFile("node_modules/.package-lock.json", "utf-8");
  } catch {
    return null;
  }

  // Guard against caching a tree that no longer matches its key.
  //
  // The capture is triggered by an fs.watch debounce on node_modules, which
  // also fires when the user runs `npm install <something>` in the terminal.
  // Without this check that install's extra packages would be captured and
  // published under the ORIGINAL template's key — silently handing every
  // future user of that template a tree containing packages they never asked
  // for. pkgHash is derived from the template's files and can't be recomputed
  // from the container (npm rewrites the lockfile during install), so compare
  // the one file npm does leave alone: package.json itself.
  try {
    const live = await instance.fs.readFile("/package.json", "utf-8");
    if (live.trim() !== expectedPackageJson.trim()) {
      depLog("capture: skipped — package.json changed since boot, key no longer describes this tree", {
        pkgHash: pkgHash.slice(0, 12),
      });
      return null;
    }
  } catch {
    depWarn("capture: skipped — could not read /package.json to verify the cache key still applies.");
    return null;
  }

  {
    const overall = depTimer("capture: total");

    const walkDone = depTimer("capture: walk tree");
    onProgress?.({
      phase: "walking",
      completed: 0,
      total: 0,
      message: "Scanning installed dependencies…",
    });
    const tree = await walkTree(instance, "node_modules");
    walkDone({ files: tree.filePaths.length, emptyDirs: tree.emptyDirs.length });

    if (tree.filePaths.length === 0 && tree.emptyDirs.length === 0) return null;

    const packDone = depTimer("capture: read + gzip");
    const { entries, compressedData, compressed, rawSize } = await captureBundle(
      instance,
      tree,
      onProgress
    );
    packDone();

    const bundle: StoredBundle = {
      entries,
      compressedData,
      compressed,
      rawSize,
      cachedAt: Date.now(),
    };

    const storeDone = depTimer("capture: write to IndexedDB");
    await storeNodeModulesBundle(pkgHash, bundle);
    storeDone();

    overall({ pkgHash: pkgHash.slice(0, 12), stored: formatBytes(compressedData.byteLength) });

    return bundle;
  }
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
const BLOB_UPLOAD_MAX_ATTEMPTS = 3;
const BLOB_UPLOAD_BASE_DELAY_MS = 2_000;

/**
 * Errors that mean "this upload will never succeed, stop trying".
 *
 * Note what is NOT reliably catchable here: the route's own write-gate
 * rejection. @vercel/blob's client swallows the server's response body and
 * surfaces every token-minting failure as the same opaque "Failed to retrieve
 * the client token", so a legitimate "an entry already exists and is fresh"
 * is indistinguishable from a transient network failure at this layer. That's
 * why alreadyCachedInBlob() below checks BEFORE uploading rather than relying
 * on classifying the failure after the fact — observed burning all three
 * attempts on a permanently-rejected write.
 */
function isPermanentUploadFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("Write rejected") ||
    message.includes("Not authenticated") ||
    message.includes("Invalid dependency cache pathname") ||
    message.includes("maximumSizeInBytes")
  );
}

/**
 * True when a fresh entry already sits at this key, making an upload both
 * pointless and guaranteed to be rejected by the route. Mirrors the route's
 * own freshness gate, but client-side and before spending a 100MB+ POST on it.
 *
 * Fails OPEN (returns false) on any uncertainty: if this can't tell, the
 * upload should still be attempted — the route re-checks authoritatively and
 * is the thing actually protecting the live entry.
 */
async function alreadyCachedInBlob(pkgHash: string): Promise<boolean> {
  if (!BLOB_BASE_URL) return false;

  try {
    const url = `${BLOB_BASE_URL}/${blobPathname(pkgHash)}`;
    const lenRes = await fetch(url, { headers: { Range: "bytes=0-3" } });
    if (lenRes.status === 404) return false;
    if (lenRes.status !== 200 && lenRes.status !== 206) return false;

    const lenBytes = new Uint8Array(await lenRes.arrayBuffer());
    if (lenBytes.byteLength < 4) return false;
    const headerLen = new DataView(lenBytes.buffer, lenBytes.byteOffset, 4).getUint32(0, true);
    if (headerLen <= 0 || headerLen > 20 * 1024 * 1024) return false;

    // Range reads against a freshly-written object can come back short; keep
    // asking for the remainder rather than treating a partial header as
    // corrupt. (This one fails open on give-up, unlike the route's gate.)
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (let attempt = 0; attempt < 5 && received < headerLen; attempt++) {
      const headerRes = await fetch(url, {
        headers: { Range: `bytes=${4 + received}-${3 + headerLen}` },
      });
      if (headerRes.status !== 200 && headerRes.status !== 206) return false;
      const chunk = new Uint8Array(await headerRes.arrayBuffer());
      if (chunk.byteLength === 0) break;
      chunks.push(chunk);
      received += chunk.byteLength;
    }
    if (received < headerLen) return false;

    const headerBytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      headerBytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const header = JSON.parse(new TextDecoder().decode(headerBytes.subarray(0, headerLen)));
    if (typeof header.cachedAt !== "number") return false;

    return !isExpired(header.cachedAt);
  } catch {
    return false;
  }
}

export async function uploadNodeModulesToBlob(
  pkgHash: string,
  bundle: StoredBundle,
  onProgress?: DepCacheProgressCallback
): Promise<boolean> {
  if (!BLOB_BASE_URL) {
    depWarn("L2 Blob upload skipped — NEXT_PUBLIC_BLOB_BASE_URL is unset.");
    return false;
  }

  const payload = encodeBundleForBlob(bundle);

  // The route's own cap. Checked here so an oversized tree fails with a clear
  // reason in the console instead of a generic 400 from token minting.
  const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;
  if (payload.byteLength > MAX_UPLOAD_BYTES) {
    depWarn(
      `L2 Blob upload skipped — bundle is ${formatBytes(payload.byteLength)}, over the ` +
        `${formatBytes(MAX_UPLOAD_BYTES)} route limit. This dependency set will never be CDN-cached.`,
      { pkgHash: pkgHash.slice(0, 12) }
    );
    return false;
  }

  if (await alreadyCachedInBlob(pkgHash)) {
    depLog("L2 Blob upload skipped — a fresh entry already exists at this key", {
      pkgHash: pkgHash.slice(0, 12),
    });
    return false;
  }

  for (let attempt = 1; attempt <= BLOB_UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const done = depTimer(`L2 Blob upload (attempt ${attempt}/${BLOB_UPLOAD_MAX_ATTEMPTS})`);

      onProgress?.({
        phase: "uploading",
        completed: 0,
        total: 1,
        message: `Sharing cached dependencies (${formatBytes(payload.byteLength)})…`,
      });

      const { upload } = await import("@vercel/blob/client");

      await upload(blobPathname(pkgHash), new Blob([payload as BlobPart]), {
        access: "public",
        handleUploadUrl: "/api/dependency-cache/blob-upload",
        contentType: "application/octet-stream",
        multipart: true,
      });

      done({ bytes: formatBytes(payload.byteLength) });
      console.info(
        `[DevPilot] Cached node_modules to CDN (Blob) for future installs — ` +
          `${formatBytes(payload.byteLength)}, key ${blobPathname(pkgHash)}`
      );
      return true;
    } catch (err) {
      if (isPermanentUploadFailure(err)) {
        // Not a warning: "an entry already exists and is still fresh" is the
        // normal steady state once a template has been cached once.
        depLog("L2 Blob upload declined by write-gate (expected when a fresh entry exists)", {
          reason: err instanceof Error ? err.message : String(err),
        });
        return false;
      }

      if (attempt === BLOB_UPLOAD_MAX_ATTEMPTS) {
        depWarn(
          `L2 Blob upload failed after ${BLOB_UPLOAD_MAX_ATTEMPTS} attempts — this dependency set ` +
            `stays npm-only for other users until someone else's install succeeds:`,
          err
        );
        return false;
      }

      const delay = BLOB_UPLOAD_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      depWarn(`L2 Blob upload attempt ${attempt} failed, retrying in ${delay}ms:`, err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return false;
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

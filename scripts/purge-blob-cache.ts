/**
 * Sweeps unreachable entries out of the Level 2 (Vercel Blob) dependency cache.
 *
 * WHY THIS IS NEEDED: the Blob tier has no eviction of ANY kind. Level 1
 * (IndexedDB) deletes expired entries on read and runs a 400MB LRU
 * (node-modules-persistence.ts), but Blob only ever gets *overwritten* — and
 * only by an upload at the exact same key. So anything that stops being
 * looked up stays there forever, paying storage rent with no possibility of
 * ever being served again.
 *
 * That became concrete when computeDependencyCacheKey() started folding
 * package-lock.json into the key: every entry written under the old
 * package.json-only scheme is now addressed by a key nothing will ever
 * compute again.
 *
 * WHAT COUNTS AS UNREACHABLE — the criterion is deliberately NOT "doesn't
 * match a current starter template". Users can edit package.json, so a
 * perfectly valid entry may correspond to a custom dependency set that
 * matches no starter. Deleting on that basis would evict live cache entries.
 *
 * The sound criterion is EXPIRY. tryRestoreFromBlob() rejects any entry past
 * MAX_AGE_MS, so an expired entry can never be served, no matter whose it is.
 * Reviving that key requires a fresh upload, which overwrites the bytes anyway
 * — so the old bytes have zero value. Expired => provably dead.
 *
 * Usage:
 *   npx tsx scripts/purge-blob-cache.ts              # dry run (default)
 *   npx tsx scripts/purge-blob-cache.ts --yes        # actually delete
 *   npx tsx scripts/purge-blob-cache.ts --include-unreadable [--yes]
 *
 * Dry run is the default deliberately: this mutates storage shared by every
 * user, so deletion has to be asked for explicitly.
 */
import "dotenv/config";
import { createHash } from "crypto";
import { readdirSync, existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { list, del } from "@vercel/blob";
import { MAX_AGE_MS } from "../lib/dependency-cache-ttl";

const BASE = process.env.NEXT_PUBLIC_BLOB_BASE_URL;
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const STARTERS = resolve(process.cwd(), "vibecode-starters");
const MAX_HEADER_BYTES = 20 * 1024 * 1024;

type Classification =
  | "expired"
  | "legacy-orphan"
  | "fresh-known"
  | "fresh-unknown"
  | "unreadable";

interface Entry {
  pathname: string;
  sizeBytes: number;
  uploadedAt: string;
  cachedAt: number | null;
  ageDays: number | null;
  classification: Classification;
  note: string;
}

/** Mirrors computeDependencyCacheKey() in node-modules-persistence.ts. */
function dependencyCacheKey(packageJson: string, packageLock: string | null): string {
  const input = packageLock
    ? `${packageJson}\n--devpilot-lock--\n${packageLock}`
    : packageJson;
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Every key a current starter could legitimately produce — both the current
 * (lockfile-folded) scheme and the legacy package.json-only one. The legacy
 * variants are computed purely so the report can say "this is an orphan from
 * the key change" rather than "unknown"; they are NOT treated as live.
 */
function knownStarterKeys(): { current: Map<string, string>; legacy: Map<string, string> } {
  const current = new Map<string, string>();
  const legacy = new Map<string, string>();
  if (!existsSync(STARTERS)) return { current, legacy };

  for (const d of readdirSync(STARTERS, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const pkgPath = join(STARTERS, d.name, "package.json");
    if (!existsSync(pkgPath)) continue;

    const pkg = readFileSync(pkgPath, "utf8");
    const lockPath = join(STARTERS, d.name, "package-lock.json");
    const lock = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : null;

    current.set(dependencyCacheKey(pkg, lock), d.name);
    if (lock) {
      // Only a genuine orphan when the starter HAS a lockfile — that's what
      // makes the package.json-only key unreachable. A lockfile-less starter
      // still computes its key this way, so it isn't legacy at all.
      legacy.set(dependencyCacheKey(pkg, null), d.name);
    }
  }
  return { current, legacy };
}

/**
 * Reads the bundle header's cachedAt. Loops the Range request because a
 * freshly-written blob was observed returning a short range — treating that
 * as corruption here would misclassify a live entry as garbage.
 */
async function readCachedAt(pathname: string): Promise<number | null> {
  try {
    const url = `${BASE}/${pathname}`;
    const lenRes = await fetch(url, { headers: { Range: "bytes=0-3" } });
    if (lenRes.status !== 200 && lenRes.status !== 206) return null;

    const lenBuf = Buffer.from(await lenRes.arrayBuffer());
    if (lenBuf.byteLength < 4) return null;
    const headerLen = lenBuf.readUInt32LE(0);
    if (headerLen <= 0 || headerLen > MAX_HEADER_BYTES) return null;

    const chunks: Buffer[] = [];
    let received = 0;
    for (let attempt = 0; attempt < 6 && received < headerLen; attempt++) {
      const res = await fetch(url, {
        headers: { Range: `bytes=${4 + received}-${3 + headerLen}` },
      });
      if (res.status !== 200 && res.status !== 206) return null;
      const chunk = Buffer.from(await res.arrayBuffer());
      if (chunk.byteLength === 0) break;
      chunks.push(chunk);
      received += chunk.byteLength;
    }
    if (received < headerLen) return null;

    const header = JSON.parse(Buffer.concat(chunks).subarray(0, headerLen).toString("utf8"));
    return typeof header.cachedAt === "number" && Number.isFinite(header.cachedAt)
      ? header.cachedAt
      : null;
  } catch {
    return null;
  }
}

function mb(n: number) {
  return (n / 1024 / 1024).toFixed(1) + "MB";
}

async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes("--yes");
  const includeUnreadable = args.includes("--include-unreadable");
  const includeLegacy = args.includes("--include-legacy-orphans");

  if (!BASE) throw new Error("NEXT_PUBLIC_BLOB_BASE_URL is not set");
  if (!TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is not set");

  const known = knownStarterKeys();
  const listed = await list({ prefix: "node-modules/", token: TOKEN });

  console.log(
    `Blob dependency cache: ${listed.blobs.length} entries, ` +
      `${mb(listed.blobs.reduce((a, b) => a + b.size, 0))} total`
  );
  console.log(
    `Known starter keys: ${known.current.size} current + ${known.legacy.size} legacy\n`
  );

  const entries: Entry[] = [];

  for (const blob of listed.blobs) {
    const hash = blob.pathname.replace(/^node-modules\//, "").replace(/\.bin$/, "");
    const cachedAt = await readCachedAt(blob.pathname);
    const ageDays = cachedAt === null ? null : (Date.now() - cachedAt) / 86_400_000;

    let classification: Classification;
    let note: string;

    const currentMatch = known.current.get(hash);
    const legacyMatch = known.legacy.get(hash);

    if (cachedAt === null) {
      classification = "unreadable";
      note = "header missing or unparseable — cannot be served";
    } else if (Date.now() - cachedAt > MAX_AGE_MS) {
      classification = "expired";
      note = currentMatch ?? legacyMatch ?? "not a starter key (custom dependency set)";
    } else if (legacyMatch && !currentMatch) {
      // Still fresh, but addressed by a key nothing can compute any more:
      // this starter ships a lockfile, so its key now folds that in. Provably
      // unreachable without waiting out the TTL.
      classification = "legacy-orphan";
      note = `${legacyMatch} — orphaned by the lockfile key change`;
    } else {
      classification = currentMatch ? "fresh-known" : "fresh-unknown";
      note = currentMatch ?? "not a starter key — likely a user's custom package.json";
    }

    entries.push({
      pathname: blob.pathname,
      sizeBytes: blob.size,
      uploadedAt: String(blob.uploadedAt),
      cachedAt,
      ageDays,
      classification,
      note,
    });
  }

  const groups: Record<Classification, Entry[]> = {
    expired: [],
    "legacy-orphan": [],
    unreadable: [],
    "fresh-known": [],
    "fresh-unknown": [],
  };
  for (const e of entries) groups[e.classification].push(e);

  for (const [label, list_] of Object.entries(groups)) {
    if (list_.length === 0) continue;
    console.log(`${label.toUpperCase()} (${list_.length})`);
    for (const e of list_) {
      const age = e.ageDays === null ? "  ?  " : `${e.ageDays.toFixed(1)}d`;
      console.log(`  ${e.pathname}  ${mb(e.sizeBytes).padStart(8)}  age=${age.padStart(6)}  ${e.note}`);
    }
    console.log("");
  }

  const deletable = [
    ...groups.expired,
    ...(includeLegacy ? groups["legacy-orphan"] : []),
    ...(includeUnreadable ? groups.unreadable : []),
  ];
  const reclaim = deletable.reduce((a, e) => a + e.sizeBytes, 0);

  if (!includeLegacy && groups["legacy-orphan"].length > 0) {
    const bytes = groups["legacy-orphan"].reduce((a, e) => a + e.sizeBytes, 0);
    const soonest = Math.min(...groups["legacy-orphan"].map((e) => e.ageDays ?? 0));
    console.log(
      `${groups["legacy-orphan"].length} legacy-orphan entr${
        groups["legacy-orphan"].length === 1 ? "y" : "ies"
      } (${mb(bytes)}) not yet expired —\n` +
        `  unreachable already (key scheme changed), but still inside MAX_AGE_MS.\n` +
        `  They age out on their own in ~${(MAX_AGE_MS / 86_400_000 - soonest).toFixed(1)} days,\n` +
        `  or pass --include-legacy-orphans to reclaim the space now.\n`
    );
  }

  const keptUnknown = groups["fresh-unknown"].length;
  if (keptUnknown > 0) {
    console.log(
      `KEEPING ${keptUnknown} fresh entr${keptUnknown === 1 ? "y" : "ies"} that match no starter key —\n` +
        `  these are still within MAX_AGE_MS and are very likely live caches for users'\n` +
        `  own edited package.json files. They are NOT orphans and must not be purged.\n`
    );
  }
  if (!includeUnreadable && groups.unreadable.length > 0) {
    console.log(
      `${groups.unreadable.length} unreadable entr${groups.unreadable.length === 1 ? "y" : "ies"} ` +
        `skipped — re-run with --include-unreadable to remove.\n`
    );
  }

  if (deletable.length === 0) {
    console.log("Nothing to purge.");
    return;
  }

  console.log(`PURGE PLAN: ${deletable.length} entries, reclaiming ${mb(reclaim)}`);

  if (!confirmed) {
    console.log("\nDry run — nothing deleted. Re-run with --yes to apply.");
    return;
  }

  let removed = 0;
  for (const e of deletable) {
    try {
      await del(`${BASE}/${e.pathname}`, { token: TOKEN });
      console.log(`  deleted ${e.pathname}`);
      removed++;
    } catch (err) {
      console.error(`  FAILED ${e.pathname}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`\nDeleted ${removed}/${deletable.length}, reclaimed up to ${mb(reclaim)}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

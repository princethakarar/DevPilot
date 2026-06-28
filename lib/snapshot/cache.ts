import { get, set, keys, del } from "idb-keyval";
import type { SnapshotCacheEntry, TemplateId, SnapshotManifest } from "./types";

const SNAPSHOT_STORE_PREFIX = "devpilot-snapshot-v2:";
const MANIFEST_KEY = "devpilot-snapshot-manifests";
const MAX_CACHE_SIZE_BYTES = 300 * 1024 * 1024;

function cacheKey(template: TemplateId, hash: string): string {
  return `${SNAPSHOT_STORE_PREFIX}${template}:${hash}`;
}

interface StoredManifest {
  template: TemplateId;
  hash: string;
  compressedSizeBytes: number;
  cachedAt: number;
}

async function getStoredManifests(): Promise<StoredManifest[]> {
  try {
    return (await get<StoredManifest[]>(MANIFEST_KEY)) ?? [];
  } catch {
    return [];
  }
}

function computeTotalSize(manifests: StoredManifest[]): number {
  return manifests.reduce((acc, m) => acc + m.compressedSizeBytes, 0);
}

export async function getCachedSnapshot(
  template: TemplateId,
  hash: string
): Promise<SnapshotCacheEntry | null> {
  try {
    const key = cacheKey(template, hash);
    const entry = await get<SnapshotCacheEntry>(key);
    if (!entry) return null;

    if (entry.manifest.hash !== hash) {
      await del(key);
      return null;
    }

    return entry;
  } catch {
    return null;
  }
}

export async function storeSnapshot(
  template: TemplateId,
  hash: string,
  blob: ArrayBuffer,
  manifest: SnapshotManifest
): Promise<void> {
  const entry: SnapshotCacheEntry = {
    manifest,
    blob,
    cachedAt: Date.now(),
  };

  const key = cacheKey(template, hash);
  await set(key, entry);

  const manifests = await getStoredManifests();
  const existing = manifests.findIndex(
    (m) => m.template === template && m.hash === hash
  );

  if (existing >= 0) {
    manifests[existing] = {
      template,
      hash,
      compressedSizeBytes: blob.byteLength,
      cachedAt: Date.now(),
    };
  } else {
    manifests.push({
      template,
      hash,
      compressedSizeBytes: blob.byteLength,
      cachedAt: Date.now(),
    });
  }

  let totalSize = computeTotalSize(manifests);
  manifests.sort((a, b) => a.cachedAt - b.cachedAt);

  while (totalSize > MAX_CACHE_SIZE_BYTES && manifests.length > 0) {
    const oldest = manifests.shift()!;
    await del(cacheKey(oldest.template, oldest.hash));
    totalSize -= oldest.compressedSizeBytes;
  }

  await set(MANIFEST_KEY, manifests);
}

export async function isSnapshotCached(
  template: TemplateId,
  hash: string
): Promise<boolean> {
  const entry = await getCachedSnapshot(template, hash);
  return entry !== null;
}

export async function clearExpiredSnapshots(
  maxAgeMs: number = 7 * 24 * 60 * 60 * 1000
): Promise<number> {
  const manifests = await getStoredManifests();
  const now = Date.now();
  const valid: StoredManifest[] = [];
  let cleared = 0;

  for (const m of manifests) {
    if (now - m.cachedAt > maxAgeMs) {
      await del(cacheKey(m.template, m.hash));
      cleared++;
    } else {
      valid.push(m);
    }
  }

  await set(MANIFEST_KEY, valid);
  return cleared;
}

export async function getCacheStatus(): Promise<{
  entries: number;
  totalBytes: number;
  templates: { template: TemplateId; hash: string; cachedAt: number }[];
}> {
  const manifests = await getStoredManifests();
  return {
    entries: manifests.length,
    totalBytes: computeTotalSize(manifests),
    templates: manifests.map((m) => ({
      template: m.template,
      hash: m.hash,
      cachedAt: m.cachedAt,
    })),
  };
}

export type TemplateId =
  | "react-vite"
  | "nextjs"
  | "vue"
  | "svelte"
  | "vanilla"
  | "astro";

export interface SnapshotManifest {
  template: TemplateId;
  version: string;
  hash: string;
  compressedSizeBytes: number;
  uncompressedSizeBytes: number;
  fileCount: number;
  nodeVersion: string;
  npmVersion: string;
  createdAt: string;
  expiresAt: string;
  stripped: {
    mdFiles: number;
    testFiles: number;
    licenseFiles: number;
    otherFiles: number;
  };
}

export interface SnapshotCacheEntry {
  manifest: SnapshotManifest;
  blob: ArrayBuffer;
  cachedAt: number;
}

export interface SnapshotProgress {
  phase: "checking-cache" | "fetching" | "decompressing" | "extracting" | "mounting" | "installing" | "starting" | "ready" | "error";
  totalBytes?: number;
  loadedBytes?: number;
  totalFiles?: number;
  extractedFiles?: number;
  message: string;
  error?: string;
}

export type SnapshotLoadResult =
  | { ok: true; method: "snapshot" | "cache" }
  | { ok: true; method: "npm-install" }
  | { ok: false; error: string };

export interface TemplateDependencyProfile {
  template: TemplateId;
  totalDeps: number;
  nodeModulesSize: number;
  compressedSize: number;
  installTime: "fast" | "medium" | "slow" | "very-slow";
  hasNativeBinaries: boolean;
  estimatedSnapshotLoadMs: number;
}

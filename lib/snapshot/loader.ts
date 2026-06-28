import type { WebContainer } from "@webcontainer/api";
import type {
  TemplateId,
  SnapshotManifest,
  SnapshotProgress,
  SnapshotLoadResult,
} from "./types";
import { getCachedSnapshot, storeSnapshot } from "./cache";
import { SNAPSHOT_CDN_BASE, TEMPLATE_SNAPSHOT_HASHES, EXTRACT_SCRIPT } from "./config";
import type { RetryStrategy } from "../boot/retry-engine";
import { trackProcess, untrackProcess } from "../boot/process-cleanup";

type ProgressCallback = (progress: SnapshotProgress) => void;

function createProgress(
  phase: SnapshotProgress["phase"],
  message: string,
  extra?: Partial<SnapshotProgress>
): SnapshotProgress {
  return { phase, message, ...extra };
}

async function fetchWithProgress(
  url: string,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<Uint8Array> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Snapshot fetch failed: ${response.status} ${response.statusText}`);
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!response.body) {
    return new Uint8Array(await response.arrayBuffer());
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }

  const combined = new Uint8Array(loaded);
  let pos = 0;
  for (const chunk of chunks) {
    combined.set(chunk, pos);
    pos += chunk.length;
  }

  return combined;
}

function parseManifestFromResponse(
  template: TemplateId,
  hash: string,
  compressedSize: number
): SnapshotManifest {
  return {
    template,
    version: hash,
    hash,
    compressedSizeBytes: compressedSize,
    uncompressedSizeBytes: 0,
    fileCount: 0,
    nodeVersion: "18",
    npmVersion: "9",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    stripped: { mdFiles: 0, testFiles: 0, licenseFiles: 0, otherFiles: 0 },
  };
}

export async function loadTemplateSnapshot(
  instance: WebContainer,
  template: TemplateId,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
  npmFlags?: string[]
): Promise<SnapshotLoadResult> {
  const hash = TEMPLATE_SNAPSHOT_HASHES[template];
  if (!hash) {
    return fallbackToNpmInstall(instance, onProgress, npmFlags, signal);
  }

  try {
    onProgress(createProgress("checking-cache", "Checking local cache..."));

    const cached = await getCachedSnapshot(template, hash);
    let compressedData: Uint8Array;
    let manifest: SnapshotManifest;

    if (cached) {
      onProgress(
        createProgress("fetching", "Loading from local cache (IndexedDB)...", {
          totalBytes: cached.blob.byteLength,
          loadedBytes: cached.blob.byteLength,
        })
      );
      compressedData = new Uint8Array(cached.blob);
      manifest = cached.manifest;
    } else {
      const url = `${SNAPSHOT_CDN_BASE}/${template}/${hash}.tar.gz`;
      onProgress(createProgress("fetching", "Downloading pre-built dependencies..."));

      compressedData = await fetchWithProgress(
        url,
        (loaded, total) => {
          onProgress(
            createProgress("fetching", "Downloading dependencies...", {
              totalBytes: total,
              loadedBytes: loaded,
            })
          );
        },
        signal
      );

      manifest = parseManifestFromResponse(template, hash, compressedData.length);

      onProgress(createProgress("fetching", "Caching for offline use..."));

      storeSnapshot(template, hash, compressedData.buffer as ArrayBuffer, manifest).catch(
        (err) => console.warn("Failed to cache snapshot:", err)
      );
    }

    onProgress(
      createProgress("extracting", "Extracting dependencies into environment...", {
        totalFiles: manifest.fileCount || undefined,
      })
    );

    await extractSnapshotInContainer(instance, compressedData, onProgress, signal);

    onProgress(createProgress("mounting", "Finalizing dependency tree..."));

    return { ok: true, method: cached ? "cache" : "snapshot" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown snapshot error";

    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Loading cancelled" };
    }

    console.warn(`Snapshot load failed for ${template}, falling back to npm:`, err);
    return fallbackToNpmInstall(instance, onProgress, npmFlags, signal);
  }
}

async function extractSnapshotInContainer(
  instance: WebContainer,
  compressedData: Uint8Array,
  onProgress: ProgressCallback,
  signal?: AbortSignal
): Promise<void> {
  const extractScriptPath = "/.devpilot/extract-snapshot.js";
  const snapshotPath = "/.devpilot/snapshot.tar.gz";

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  await instance.fs.mkdir("/.devpilot", { recursive: true });

  onProgress(createProgress("extracting", "Writing dependency archive to environment..."));
  await instance.fs.writeFile(snapshotPath, compressedData);

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  onProgress(createProgress("extracting", "Extracting dependencies (this may take a moment)..."));
  await instance.fs.writeFile(extractScriptPath, EXTRACT_SCRIPT);

  const extractProcess = await instance.spawn("node", [
    extractScriptPath,
    snapshotPath,
    "/",
  ]);

  trackProcess("extract-process", extractProcess, "node extract-snapshot.js");

  const pipeAbort = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => pipeAbort.abort(), { once: true });
  }

  const pipePromise = extractProcess.output.pipeTo(
    new WritableStream({
      write(data) {
        if (pipeAbort.signal.aborted) return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.extracted) {
            onProgress(
              createProgress("extracting", `Extracting dependencies... ${parsed.extracted} files`, {
                extractedFiles: parsed.extracted,
              })
            );
          }
          if (parsed.done) {
            onProgress(
              createProgress("extracting", `Extracted ${parsed.total} files`, {
                extractedFiles: parsed.total,
                totalFiles: parsed.total,
              })
            );
          }
        } catch {}
      },
    }),
    { signal: pipeAbort.signal }
  ).catch((err) => {
    if (err?.name !== "AbortError") {
      console.error("[DevPilot] extractProcess pipeTo error:", err);
    }
  });

  const exitCode = await extractProcess.exit;

  pipeAbort.abort();
  await pipePromise;
  untrackProcess("extract-process");

  if (exitCode !== 0 && !signal?.aborted) {
    throw new Error(`Snapshot extraction failed with exit code ${exitCode}`);
  }

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  try {
    await instance.fs.rm(snapshotPath);
    await instance.fs.rm(extractScriptPath);
  } catch {}
}

export async function fallbackToNpmInstall(
  instance: WebContainer,
  onProgress: ProgressCallback,
  flags?: string[],
  signal?: AbortSignal
): Promise<SnapshotLoadResult> {
  const installFlags = flags?.length ? flags : [
    "install",
    "--no-audit",
    "--no-fund",
    "--prefer-offline",
  ];

  onProgress(createProgress("installing", "Installing dependencies via npm..."));

  if (signal?.aborted) {
    return { ok: false, error: "Loading cancelled" };
  }

  try {
    const installProcess = await instance.spawn("npm", installFlags);

    trackProcess("npm-install", installProcess, `npm ${installFlags.join(" ")}`);

    const pipeAbort = new AbortController();
    if (signal) {
      signal.addEventListener("abort", () => pipeAbort.abort(), { once: true });
    }

    const outputChunks: string[] = [];

    const pipePromise = installProcess.output.pipeTo(
      new WritableStream({
        write(data) {
          if (pipeAbort.signal.aborted) return;
          outputChunks.push(data);
          onProgress(createProgress("installing", data.trim() || "Installing dependencies..."));
        },
      }),
      { signal: pipeAbort.signal }
    ).catch((err) => {
      if (err?.name !== "AbortError") {
        console.error("[DevPilot] installProcess pipeTo error:", err);
      }
    });

    const exitCode = await installProcess.exit;

    pipeAbort.abort();
    await pipePromise;
    untrackProcess("npm-install");

    if (signal?.aborted) {
      return { ok: false, error: "Loading cancelled" };
    }

    if (exitCode !== 0) {
      return {
        ok: false,
        error: `npm install failed (exit ${exitCode})\n${outputChunks.join("")}`,
      };
    }

    return { ok: true, method: "npm-install" };
  } catch (err) {
    untrackProcess("npm-install");
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Loading cancelled" };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

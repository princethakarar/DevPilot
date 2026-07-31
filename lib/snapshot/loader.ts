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
import {
  DEFAULT_MAXSOCKETS,
  OOM_MAXSOCKETS,
  installFlags,
  npmrcContents,
  isOomExit,
} from "../boot/npm-flags";
import { depLog, depWarn } from "../dep-cache-debug";
import {
  resolveMaxsockets,
  recordOomDowngrade,
  reportInstallOutcome,
} from "../boot/maxsockets-rollout";

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

interface NpmRunResult {
  exitCode: number | null;
  output: string;
  aborted: boolean;
}

/**
 * One npm install attempt at a given socket cap. Split out from
 * fallbackToNpmInstall so the OOM fallback can re-run it with a different cap
 * without duplicating the process/stream plumbing.
 */
async function runNpmInstall(
  instance: WebContainer,
  flags: string[],
  maxsockets: number,
  onProgress: ProgressCallback,
  signal?: AbortSignal
): Promise<NpmRunResult> {
  // Written before spawning: the CLI flags alone don't constrain npm's
  // internal resolution requests, only its tarball fetches.
  try {
    await instance.fs.writeFile("/.npmrc", npmrcContents(maxsockets));
  } catch {
    // Non-fatal — continue even if .npmrc write fails
  }

  const installProcess = await instance.spawn("npm", flags);
  trackProcess("npm-install", installProcess, `npm ${flags.join(" ")}`);

  // Test hook — a REAL kill, not a simulated one.
  //
  // `devpilot:force-oom-once` (in fallbackToNpmInstall) bypasses detection
  // entirely, so it proves the recovery sequence but says nothing about
  // whether a genuine kill is recognised. This hook instead terminates the
  // live npm process mid-install and lets the real exit code flow through the
  // real isOomExit(), which is the only way to check the load-bearing
  // assumption that WebContainer surfaces a kill as exit 143.
  try {
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("devpilot:kill-install-once") === "1"
    ) {
      localStorage.removeItem("devpilot:kill-install-once");
      const killAfterMs = 4_000;
      depWarn(`TEST HOOK: killing the live npm process in ${killAfterMs}ms to observe a real kill.`);
      setTimeout(() => {
        try {
          installProcess.kill();
        } catch (err) {
          depWarn("TEST HOOK: kill() threw:", err);
        }
      }, killAfterMs);
    }
  } catch {
    // storage unavailable — no test hook, normal behaviour
  }

  const pipeAbort = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => pipeAbort.abort(), { once: true });
  }

  const outputChunks: string[] = [];

  const pipePromise = installProcess.output
    .pipeTo(
      new WritableStream({
        write(data) {
          if (pipeAbort.signal.aborted) return;
          outputChunks.push(data);
          onProgress(createProgress("installing", data.trim() || "Installing dependencies..."));
        },
      }),
      { signal: pipeAbort.signal }
    )
    .catch((err) => {
      if (err?.name !== "AbortError") {
        console.error("[DevPilot] installProcess pipeTo error:", err);
      }
    });

  const exitCode = await installProcess.exit;

  pipeAbort.abort();
  await pipePromise;
  untrackProcess("npm-install");

  const output = outputChunks.join("");

  // The raw exit code is logged unconditionally at debug level, separately
  // from any OOM classification. Whether the sandbox's kill really does
  // surface as 143 is the assumption the whole fallback rests on, and this
  // line is what makes it checkable against real sessions instead of assumed.
  depLog("npm install exited", {
    exitCode,
    maxsockets,
    classifiedAsOom: isOomExit(exitCode, output),
    outputTail: output.slice(-200),
  });

  return {
    exitCode,
    output,
    aborted: !!signal?.aborted,
  };
}

export async function fallbackToNpmInstall(
  instance: WebContainer,
  onProgress: ProgressCallback,
  flags?: string[],
  signal?: AbortSignal
): Promise<SnapshotLoadResult> {
  // The socket cap is NOT a constant here — it comes from the staged rollout
  // (lib/boot/maxsockets-rollout.ts), which defaults every session to the
  // proven-safe serialised cap until an explicit rollout percentage is set.
  // The raised cap's OOM behaviour has never been observed in a real sandbox,
  // so it reaches users as a measured experiment, not as a default.
  const decision = resolveMaxsockets();
  const cap = decision.maxsockets;

  depLog("npm install: socket cap resolved", {
    maxsockets: cap,
    reason: decision.reason,
    bucket: decision.bucket,
    rolloutPct: decision.rolloutPct,
  });

  // --prefer-offline lets npm reuse anything already in its cache rather than
  // re-fetching; --no-progress and --loglevel=error keep stdout writes (and
  // their memory cost) down. See lib/boot/npm-flags.ts for the socket policy.
  const baseFlags = flags?.length ? flags : installFlags(["--prefer-offline"], cap);

  onProgress(createProgress("installing", "Installing dependencies via npm..."));

  if (signal?.aborted) {
    return { ok: false, error: "Loading cancelled" };
  }

  const startedAt = Date.now();

  try {
    const first = await runNpmInstall(instance, baseFlags, cap, onProgress, signal);

    if (first.aborted) return { ok: false, error: "Loading cancelled" };

    // Test hook: lets the OOM fallback be exercised end-to-end in a real
    // WebContainer without having to actually starve the sandbox of memory.
    // Set localStorage["devpilot:force-oom-once"] = "1" and the next install
    // is treated as if it had been SIGTERM-killed; the flag clears itself so
    // the retry proceeds normally. Everything downstream of the detection —
    // the warning, the settle delay, the .npmrc rewrite, the respawn at
    // OOM_MAXSOCKETS — runs exactly as it would for a genuine kill.
    let forcedOom = false;
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem("devpilot:force-oom-once") === "1") {
        localStorage.removeItem("devpilot:force-oom-once");
        forcedOom = true;
        depWarn("TEST HOOK: forcing the next install to be treated as an OOM kill.");
      }
    } catch {
      // storage unavailable — no test hook, normal behaviour
    }

    const oomDetected = forcedOom || isOomExit(first.exitCode, first.output);

    if (first.exitCode === 0 && !forcedOom) {
      reportInstallOutcome({
        ok: true,
        exitCode: first.exitCode,
        maxsockets: cap,
        decisionReason: decision.reason,
        bucket: decision.bucket,
        durationMs: Date.now() - startedAt,
        oomDetected: false,
        fallbackUsed: false,
      });
      return { ok: true, method: "npm-install" };
    }

    // HARD REQUIREMENT, not an optimisation: the sandbox OOM-killing npm is
    // exactly the failure the old blanket maxsockets=1 existed to prevent.
    // Raising the default trades that guarantee for speed, so the guarantee
    // has to be re-established here — drop to fully-serialised downloads and
    // try once more before surfacing any error. This lives in the live install
    // path deliberately: useNodeModulesPersistence calls this function with no
    // retry wrapper of any kind around it.
    if (oomDetected) {
      depWarn(
        `npm was killed by the sandbox (exit ${first.exitCode}) at maxsockets=${cap} — ` +
          `retrying fully serialised at maxsockets=${OOM_MAXSOCKETS}.`
      );

      // Pin this browser to the serialised cap so the same user doesn't keep
      // paying a killed install plus a retry on every subsequent boot.
      recordOomDowngrade(cap);

      onProgress(
        createProgress("installing", "Low on memory — retrying with reduced concurrency...")
      );

      // Give the WASM sandbox time to actually reclaim the memory before
      // asking it for more; retrying immediately just gets killed again.
      await new Promise((r) => setTimeout(r, 3_000));

      if (signal?.aborted) return { ok: false, error: "Loading cancelled" };

      const serialFlags = baseFlags
        .filter((f) => !f.startsWith("--maxsockets"))
        .concat(`--maxsockets=${OOM_MAXSOCKETS}`);

      const second = await runNpmInstall(
        instance,
        serialFlags,
        OOM_MAXSOCKETS,
        onProgress,
        signal
      );

      if (second.aborted) return { ok: false, error: "Loading cancelled" };

      reportInstallOutcome({
        ok: second.exitCode === 0,
        exitCode: first.exitCode,
        maxsockets: cap,
        decisionReason: decision.reason,
        bucket: decision.bucket,
        durationMs: Date.now() - startedAt,
        oomDetected: true,
        fallbackUsed: true,
        fallbackOk: second.exitCode === 0,
      });

      if (second.exitCode === 0) {
        depLog("npm install succeeded on the serialised OOM-fallback attempt.");
        return { ok: true, method: "npm-install" };
      }

      return {
        ok: false,
        error: `npm install failed (exit ${second.exitCode}) after OOM fallback\n${second.output}`,
      };
    }

    reportInstallOutcome({
      ok: false,
      exitCode: first.exitCode,
      maxsockets: cap,
      decisionReason: decision.reason,
      bucket: decision.bucket,
      durationMs: Date.now() - startedAt,
      oomDetected: false,
      fallbackUsed: false,
    });

    return {
      ok: false,
      error: `npm install failed (exit ${first.exitCode})\n${first.output}`,
    };
  } catch (err) {
    untrackProcess("npm-install");
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Loading cancelled" };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

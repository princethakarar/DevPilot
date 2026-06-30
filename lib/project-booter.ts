import type { WebContainer, WebContainerProcess } from "@webcontainer/api";
import type { TemplateId, SnapshotProgress } from "./snapshot/types";
import { loadTemplateSnapshot } from "./snapshot/loader";
import { transformToWebContainerFormat } from "@/modules/webcontainers/hooks/transformer";
import { verifyInstall, checkForPartialInstall } from "./boot/install-verifier";
import { detectInstallErrors, parseInstallProgress, classifyExitCode } from "./boot/error-detector";
import { withSmartRetry, BootRetryExhaustedError, type RetryStrategy } from "./boot/retry-engine";
import { cleanupWebContainer, trackProcess, untrackProcess } from "./boot/process-cleanup";

export interface BootState {
  phase: BootPhase;
  progress: number;
  message: string;
  error?: string;
  errorCategory?: string;
  errorSuggestion?: string;
  retryCount?: number;
  maxRetries?: number;
  currentStrategy?: string;
  dependencyProgress?: SnapshotProgress;
}

export type BootPhase =
  | "booting"
  | "mounting-sources"
  | "loading-dependencies"
  | "verifying"
  | "starting-server"
  | "ready"
  | "error";

export type BootCallback = (state: BootState) => void;

interface BootOptions {
  instance: WebContainer;
  templateId: TemplateId;
  templateData: { folderName: string; items: any[] };
  onBootState: BootCallback;
  signal?: AbortSignal;
}

export interface BootResult {
  success: boolean;
  previewUrl?: string;
  method?: "snapshot" | "cache" | "npm-install";
  error?: string;
  retries?: number;
  strategiesUsed?: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function bootProject(options: BootOptions): Promise<BootResult> {
  const { instance, templateId, templateData, onBootState, signal } = options;

  let devProcess: WebContainerProcess | null = null;
  let serverReadyTimeout: ReturnType<typeof setTimeout> | null = null;
  let pipeAbort: AbortController | null = null;
  let serverReadyHandler: ((_port: number, url: string) => void) | null = null;
  let currentPipeSettled: Promise<void> | null = null;
  let installAbort: AbortController | null = null;

  function emit(phase: BootPhase, progress: number, message: string, extra?: Partial<BootState>) {
    if (signal?.aborted) return;
    onBootState({ phase, progress, message, ...extra });
  }

  async function teardownBeforeRetry(): Promise<void> {
    // 0. Cancel any in-flight loadTemplateSnapshot / npm install
    if (installAbort) {
      installAbort.abort();
      installAbort = null;
    }

    // 1. Abort the pipeTo stream first — triggers abort listener in firstOutput Promise
    if (pipeAbort) {
      pipeAbort.abort();
      pipeAbort = null;
    }

    // 2. Wait for firstOutput Promise to fully settle so stream lock is released
    if (currentPipeSettled) {
      await currentPipeSettled;
      currentPipeSettled = null;
    }

    // 3. Remove stale server-ready listener so it doesn't fire for the next attempt
    if (serverReadyHandler) {
      try { (instance as any).off?.("server-ready", serverReadyHandler); } catch {}
      serverReadyHandler = null;
    }

    // 4. Clear server-ready timeout
    if (serverReadyTimeout) {
      clearTimeout(serverReadyTimeout);
      serverReadyTimeout = null;
    }

    // 5. Kill the dev process
    if (devProcess) {
      try { devProcess.kill(); } catch {}
      devProcess = null;
    }

    await cleanupWebContainer(instance);
    await sleep(300);
  }

  async function runInstallAndVerify(
    flags: string[],
    strategy: RetryStrategy
  ): Promise<{ devServerUrl: string }> {
    if (templateId === "node") {
      emit("ready", 100, "Terminal Ready!");
      return { devServerUrl: "" };
    }

    const outputAccumulator: string[] = [];
    let detectedError = false;

    emit("loading-dependencies", 30, `Installing dependencies (${strategy.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())})...`, {
      currentStrategy: strategy.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    });

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // Per-attempt AbortController for loadTemplateSnapshot — cancelled on teardown
    installAbort = new AbortController();
    if (signal) {
      signal.addEventListener("abort", () => installAbort?.abort(), { once: true });
    }

    const installResult = await loadTemplateSnapshot(instance, templateId, (depProgress) => {
      let progress = 30;

      if (depProgress.phase === "installing" && depProgress.message) {
        const error = detectInstallErrors(depProgress.message);
        if (error && !detectedError) {
          detectedError = true;
          emit("loading-dependencies", 35, `Issue detected: ${error.message}`, {
            errorSuggestion: error.suggestion,
            dependencyProgress: depProgress,
          });
        }

        const progressInfo = parseInstallProgress(depProgress.message);
        if (progressInfo?.added) {
          const current = progressInfo.added;
          progress = Math.min(70, 30 + Math.min(current / 100, 1) * 35);
        }
      }

      if (depProgress.phase === "checking-cache") progress = 30;
      else if (depProgress.phase === "fetching") progress = Math.min(50, 30 + ((depProgress.loadedBytes ?? 0) / (depProgress.totalBytes ?? 1)) * 20);
      else if (depProgress.phase === "extracting") progress = Math.min(75, 55 + ((depProgress.extractedFiles ?? 0) / (depProgress.totalFiles ?? 1)) * 20);

      emit("loading-dependencies", Math.round(progress), depProgress.message, {
        dependencyProgress: depProgress,
      });
    }, installAbort.signal);

    if (!installResult.ok) {
      installAbort = null;
      throw new Error(installResult.error || "Failed to load dependencies");
    }

    // Snapshot/install completed successfully — no need to cancel anymore
    installAbort = null;

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    emit("loading-dependencies", 75, "Verifying installation...");

    await sleep(500);

    const verification = await verifyInstall(instance, templateId);

    if (!verification.success) {
      throw new Error(`Install verification failed: ${verification.reason}`);
    }

    const partialCheck = await checkForPartialInstall(instance);
    if (partialCheck) {
      throw new Error("Partial install detected — some packages may be missing");
    }

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    emit("starting-server", 80, "Starting development server...");

    devProcess = await instance.spawn("npm", ["run", "dev"]);
    trackProcess("dev-server", devProcess, "npm run dev");

    // Create a per-attempt AbortController for the pipeTo stream.
    // This is the KEY fix: passing { signal } to pipeTo() allows us to
    // properly release the stream lock during teardown/retry/abort.
    pipeAbort = new AbortController();

    // If the outer boot signal is already wired, chain it to our pipe abort
    if (signal) {
      signal.addEventListener("abort", () => pipeAbort?.abort(), { once: true });
    }

    // Safety guard: detect if prior teardown failed to release — throw descriptive error
    if (devProcess!.output.locked) {
      throw new Error(
        `[DevPilot] Stream already locked before pipeTo on retry. ` +
        `This indicates teardown did not complete cleanly.`
      );
    }

    const firstOutputPromise: Promise<string> = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Dev server produced no output within 15s"));
      }, 15_000);

      // Reject immediately when pipeAbort fires (during teardown/retry),
      // so the Promise settles before the next attempt starts
      pipeAbort!.signal.addEventListener("abort", () => {
        clearTimeout(timeout);
        reject(new DOMException("Pipe aborted", "AbortError"));
      }, { once: true });

      let first = true;

      devProcess!.output.pipeTo(
        new WritableStream({
          write(data) {
            if (pipeAbort?.signal.aborted) return;

            if (first) {
              first = false;
              clearTimeout(timeout);
              resolve(data);
            }

            outputAccumulator.push(data);
            emit("starting-server", 85, data.trim() || "Starting...");
          },
        }),
        { signal: pipeAbort!.signal }
      ).catch((err) => {
        if (err?.name !== "AbortError") {
          console.error("pipeTo error:", err);
          reject(err);
        }
      });
    });

    // Track when the firstOutput Promise settles so teardown can await it
    currentPipeSettled = firstOutputPromise.then(() => {}).catch(() => {});

    const firstOutput = await firstOutputPromise;

    emit("starting-server", 85, firstOutput.trim() || "Starting...");

    const previewUrl = await new Promise<string>((resolve, reject) => {
      serverReadyTimeout = setTimeout(() => {
        reject(new Error("Dev server did not emit server-ready within 90s"));
      }, 90_000);

      // Store the handler so we can remove it during teardown
      serverReadyHandler = (_port: number, url: string) => {
        if (serverReadyTimeout) clearTimeout(serverReadyTimeout);
        resolve(url);
      };
      instance.on("server-ready", serverReadyHandler);

      devProcess!.exit.then((code) => {
        if (serverReadyTimeout) clearTimeout(serverReadyTimeout);

        const fullOutput = outputAccumulator.join("\n");
        const classified = classifyExitCode(code, fullOutput);

        if (code !== null && code !== 0) {
          reject(new Error(classified.userMessage));
        }
      });
    });

    // server-ready is the authoritative WebContainer signal that the dev server
    // is listening on its port. A cross-origin HEAD fetch (verifyServerResponds)
    // is redundant here and is always blocked by COEP (require-corp) because the
    // WebContainer proxy URL returns no CORS/CORP headers. Skip the health check.
    untrackProcess("dev-server");

    return { devServerUrl: previewUrl };
  }

  try {
    emit("booting", 0, "Initializing environment...");
    if (signal?.aborted) return { success: false, error: "Cancelled" };

    emit("mounting-sources", 15, "Mounting project files...");
    const files = transformToWebContainerFormat(templateData);
    await instance.mount(files);

    if (signal?.aborted) return { success: false, error: "Cancelled" };

    const retryResult = await withSmartRetry(
      async (flags, strategy) => {
        return runInstallAndVerify(flags, strategy);
      },
      {
        maxRetries: 3,
        baseDelayMs: 1_000,
        strategy: "normal",
        onRetry: (attempt, error, strategy) => {
          const strategyLabel = strategy.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());
          emit("error", 0, `Attempt ${attempt + 1} of 4 — ${error}`, {
            error: error,
            errorSuggestion: `Retrying with ${strategyLabel}`,
            retryCount: attempt,
            maxRetries: 3,
            currentStrategy: strategyLabel,
          });

          setTimeout(() => {
            emit("loading-dependencies", 30, `Retrying — ${strategyLabel}...`, {
              retryCount: attempt,
              maxRetries: 3,
              currentStrategy: strategyLabel,
            });
          }, 100);
        },
        teardown: teardownBeforeRetry,
      }
    );

    emit("ready", 100, "Ready!");

    return {
      success: true,
      previewUrl: retryResult.result.devServerUrl,
      method: "npm-install" as const,
      retries: retryResult.state.attempt,
      strategiesUsed: retryResult.state.strategiesUsed,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { success: false, error: "Cancelled" };
    }

    if (err instanceof BootRetryExhaustedError) {
      const classified = classifyExitCode(1, err.lastError);
      emit("error", 0, "", {
        error: "Could not start project after multiple attempts.",
        errorCategory: classified.suggestedAction,
        errorSuggestion: "Try switching to a lighter template, or check the terminal output for details.",
        retryCount: 3,
        maxRetries: 3,
      });

      return {
        success: false,
        error: "Could not start project after multiple attempts.",
        retries: 3,
        strategiesUsed: err.strategiesUsed,
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    const classified = classifyExitCode(1, message);

    emit("error", 0, "", {
      error: message,
      errorCategory: classified.suggestedAction,
      errorSuggestion: classified.userMessage,
    });

    return { success: false, error: message };
  } finally {
    // Cancel any in-flight loadTemplateSnapshot
    (installAbort as AbortController | null)?.abort();
    installAbort = null;

    if (serverReadyTimeout) clearTimeout(serverReadyTimeout);
    // Clean up pipe abort controller if still active (e.g., on unhandled error)
    if (pipeAbort) {
      (pipeAbort as AbortController).abort();
      pipeAbort = null;
    }
    // Remove any lingering server-ready listener
    if (serverReadyHandler) {
      try { (instance as any).off?.("server-ready", serverReadyHandler); } catch {}
      serverReadyHandler = null;
    }
  }
}

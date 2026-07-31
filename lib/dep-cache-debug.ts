/**
 * Diagnostics for the dependency-cache pipeline (IndexedDB -> Blob -> npm).
 *
 * This exists because the last round of "why is next.js slow?" required
 * hand-adding console.logs to answer basic questions — how many files were
 * walked, how long the gzip took, whether the Blob upload actually happened.
 * All of that is now permanently instrumented and gated behind this flag, so
 * the same investigation is a one-liner next time.
 *
 * Enable either way:
 *   - localStorage.setItem("devpilot:debug-deps", "1")  (per-browser, no rebuild)
 *   - NEXT_PUBLIC_DEP_CACHE_DEBUG=1                     (per-deployment)
 *
 * Off by default: these logs are per-phase, not per-file, but a cold nextjs
 * install still emits enough of them to be noise in a normal session.
 */

const DEBUG_STORAGE_KEY = "devpilot:debug-deps";

export function depCacheDebugEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_DEP_CACHE_DEBUG === "1") return true;
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch {
    // Storage can throw in private-mode/partitioned contexts — treat as off.
    return false;
  }
}

export function depLog(message: string, data?: Record<string, unknown>): void {
  if (!depCacheDebugEnabled()) return;
  if (data) console.info(`[DevPilot][deps] ${message}`, data);
  else console.info(`[DevPilot][deps] ${message}`);
}

/**
 * Always-on warning channel — unlike depLog these fire regardless of the debug
 * flag, because they mark a cache tier silently degrading to the slower one.
 * That is precisely the class of failure that went unnoticed before.
 */
export function depWarn(message: string, data?: unknown): void {
  // Errors are flattened to text rather than passed through as objects: Next's
  // dev log forwarder JSON-stringifies whatever it's given, and an Error
  // serialises to `{}` — which is exactly what happened while diagnosing a
  // failing Blob upload, turning the one line that mattered into noise.
  const detail =
    data instanceof Error
      ? `${data.name}: ${data.message}`
      : data === undefined
        ? ""
        : data;
  console.warn(`[DevPilot][deps] ${message}`, detail);
}

/**
 * Starts a phase timer. Returns a function that logs the elapsed time (and any
 * extra fields) when called, and also returns the raw ms so callers can
 * aggregate. The timer itself is free when debugging is off; only the log is
 * suppressed, so timings stay available to callers either way.
 */
export function depTimer(label: string): (data?: Record<string, unknown>) => number {
  const start = Date.now();
  depLog(`${label} — start`);
  return (data?: Record<string, unknown>) => {
    const elapsedMs = Date.now() - start;
    depLog(`${label} — done in ${elapsedMs}ms`, data);
    return elapsedMs;
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

/**
 * Runs `fn` over `items` with at most `limit` in flight, preserving input
 * order in the returned array.
 *
 * Deliberately not a generic p-limit clone: the batching is fixed-window
 * (wait for a whole batch before starting the next) rather than a sliding
 * window. That's slightly less efficient with high-variance task durations,
 * but it bounds peak memory to exactly `limit` in-flight results, which is the
 * property that matters when each result is a file's full contents and the
 * tree is ~17k files. A sliding window can hold more than `limit` completed-
 * but-unconsumed buffers alive.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onBatch?: (completed: number, total: number) => void
): Promise<R[]> {
  if (items.length === 0) return [];
  const effectiveLimit = Math.max(1, limit);
  const results: R[] = new Array(items.length);

  for (let offset = 0; offset < items.length; offset += effectiveLimit) {
    const batch = items.slice(offset, offset + effectiveLimit);
    const settled = await Promise.all(batch.map((item, i) => fn(item, offset + i)));
    for (let i = 0; i < settled.length; i++) results[offset + i] = settled[i];
    onBatch?.(Math.min(offset + effectiveLimit, items.length), items.length);
  }

  return results;
}

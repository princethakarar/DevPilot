/**
 * npm concurrency policy for installs running inside the WebContainer sandbox.
 *
 * BACKGROUND: this was previously pinned to `--maxsockets=1` everywhere, as a
 * defence against the sandbox SIGTERM-killing npm under memory pressure (exit
 * 143). It works, but it serialises every tarball download AND every metadata
 * request. Measured on the host against the nextjs starter with a cold npm
 * cache: 276s at maxsockets=1 vs 110s at npm's default of 15 — a 2.5x penalty,
 * and that measurement understates it, since the maxsockets=1 run went first
 * and so paid the DNS/TLS cold start that the second run inherited warm.
 *
 * POLICY: start at a conservative middle ground, and treat the OOM signal as
 * authoritative rather than trying to predict it. DEFAULT_MAXSOCKETS is well
 * under npm's default, so peak concurrent-download memory stays far below what
 * caused the original kills, while still overlapping enough requests to hide
 * per-request latency. If the sandbox kills the install anyway, OOM_MAXSOCKETS
 * reproduces exactly the old fully-serialised behaviour.
 *
 * The fallback is not optional and not advisory: fallbackToNpmInstall retries
 * at OOM_MAXSOCKETS whenever it sees a SIGTERM/143 exit, independently of the
 * (currently unused) retry engine, because the live install path in
 * useNodeModulesPersistence has no retry wrapper around it at all.
 */
export const DEFAULT_MAXSOCKETS = 6;
export const OOM_MAXSOCKETS = 1;

/** Flags shared by every strategy, independent of the socket cap. */
const BASE_FLAGS = ["--no-audit", "--no-fund", "--no-progress", "--loglevel=error"];

export function installFlags(extra: string[], maxsockets: number): string[] {
  return ["install", ...BASE_FLAGS, ...extra, `--maxsockets=${maxsockets}`];
}

/**
 * The .npmrc written before spawning npm. The CLI flags above don't cover
 * npm's internal resolution requests, so the cap has to be set at config level
 * too or the socket limit silently doesn't apply to the metadata phase.
 */
export function npmrcContents(maxsockets: number): string {
  return [
    "fetch-retries=2",
    "fetch-timeout=60000",
    `maxsockets=${maxsockets}`,
    "progress=false",
    "loglevel=error",
    "audit=false",
    "fund=false",
  ].join("\n");
}

/**
 * True when npm's exit looked like the sandbox reclaiming memory rather than a
 * dependency problem. 143 is SIGTERM; WebContainer surfaces the OOM kill that
 * way rather than through npm's own error reporting, so the exit code and any
 * captured output are the only evidence available.
 */
export function isOomExit(exitCode: number | null, output: string): boolean {
  if (exitCode === 143) return true;
  return (
    output.includes("SIGTERM") ||
    output.includes("Killed") ||
    output.includes("out of memory") ||
    output.includes("JavaScript heap out of memory")
  );
}

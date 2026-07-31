import { DEFAULT_MAXSOCKETS, OOM_MAXSOCKETS, installFlags } from "./npm-flags";

export type RetryStrategy = "normal" | "legacy-peers" | "force" | "no-optional" | "ignore-scripts";

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  strategy: RetryStrategy;
  onRetry: (attempt: number, error: string, strategy: RetryStrategy) => void;
  teardown?: () => Promise<void>;
}

export interface RetryState {
  attempt: number;
  strategy: RetryStrategy;
  strategiesUsed: RetryStrategy[];
  lastError: string;
}

interface StrategyConfig {
  flags: string[];
  label: string;
}

// Socket caps come from lib/boot/npm-flags.ts so this file and the live
// install path in lib/snapshot/loader.ts can't drift apart. `no-optional` is
// the strategy selected on OOM/SIGTERM, so it's the one that also drops to the
// fully-serialised cap — every other strategy is responding to a dependency
// resolution problem, not memory pressure, and has no reason to give up
// download concurrency.
const STRATEGIES: Record<RetryStrategy, StrategyConfig> = {
  normal: {
    flags: installFlags(["--prefer-offline"], DEFAULT_MAXSOCKETS),
    label: "Normal install",
  },
  "legacy-peers": {
    flags: installFlags(["--prefer-offline", "--legacy-peer-deps"], DEFAULT_MAXSOCKETS),
    label: "Legacy peer deps mode",
  },
  force: {
    flags: installFlags(["--force"], DEFAULT_MAXSOCKETS),
    label: "Force mode",
  },
  "no-optional": {
    flags: installFlags(["--prefer-offline", "--no-optional"], OOM_MAXSOCKETS),
    label: "Skipping optional deps",
  },
  "ignore-scripts": {
    flags: installFlags(["--prefer-offline", "--ignore-scripts"], DEFAULT_MAXSOCKETS),
    label: "Skipping install scripts",
  },
};

const STRATEGY_PROGRESSION: { errorPattern: string; switchTo: RetryStrategy }[] = [
  { errorPattern: "ERESOLVE", switchTo: "legacy-peers" },
  { errorPattern: "EINTEGRITY", switchTo: "force" },
  { errorPattern: "postinstall", switchTo: "ignore-scripts" },
  { errorPattern: "ENOSPC", switchTo: "no-optional" },
  { errorPattern: "Cannot find module", switchTo: "force" },
  { errorPattern: "exit code 1", switchTo: "legacy-peers" },
  // exit 143 = SIGTERM (OOM kill by the WASM sandbox). Switch to no-optional
  // to reduce the package count and memory footprint on the next attempt.
  { errorPattern: "exit 143", switchTo: "no-optional" },
  { errorPattern: "exit code 143", switchTo: "no-optional" },
  { errorPattern: "SIGTERM", switchTo: "no-optional" },
];

export function getRetryDelay(attempt: number, baseDelayMs: number, error?: string): number {
  // OOM/SIGTERM (exit 143) needs 3 s+ for the WASM sandbox to reclaim memory.
  // For all other errors (ERESOLVE, network, etc.) 1 s is sufficient.
  const isOom = error && (
    error.includes("143") ||
    error.includes("SIGTERM") ||
    error.includes("killed") ||
    error.includes("memory")
  );
  const floor = isOom ? 3000 : 1000;
  return Math.min(Math.max(floor, baseDelayMs * Math.pow(2, attempt - 1)), 15_000);
}

export function selectStrategy(
  error: string,
  currentStrategy: RetryStrategy,
  attempt: number
): RetryStrategy {
  if (attempt >= 3) return "force";

  for (const progression of STRATEGY_PROGRESSION) {
    if (error.includes(progression.errorPattern)) {
      if (progression.switchTo !== currentStrategy) {
        return progression.switchTo;
      }
    }
  }

  if (attempt >= 2) return "legacy-peers";
  return "normal";
}

export function getNpmFlags(strategy: RetryStrategy): string[] {
  return STRATEGIES[strategy]?.flags ?? STRATEGIES.normal.flags;
}

export function getStrategyLabel(strategy: RetryStrategy): string {
  return STRATEGIES[strategy]?.label ?? "Normal install";
}

export async function withSmartRetry<T>(
  operation: (flags: string[], strategy: RetryStrategy) => Promise<T>,
  options: RetryOptions
): Promise<{ result: T; state: RetryState }> {
  const { maxRetries, baseDelayMs, onRetry, teardown } = options;

  let lastError = "";
  let currentStrategy: RetryStrategy = options.strategy;
  const strategiesUsed: RetryStrategy[] = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      currentStrategy = selectStrategy(lastError, currentStrategy, attempt);

      onRetry(attempt, lastError, currentStrategy);

      if (teardown) {
        await teardown();
      }

      // Additional settle time for WebContainer process registry to clear.
      // Delay is error-aware: OOM/SIGTERM needs 3 s+ for WASM memory reclaim;
      // other errors only need 1 s.
      const delayMs = getRetryDelay(attempt, baseDelayMs, lastError);
      await new Promise((resolve) => setTimeout(resolve, Math.max(500, delayMs)));
    }

    strategiesUsed.push(currentStrategy);

    try {
      const flags = getNpmFlags(currentStrategy);
      const result = await operation(flags, currentStrategy);

      return {
        result,
        state: {
          attempt,
          strategy: currentStrategy,
          strategiesUsed,
          lastError: "",
        },
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);

      if (attempt >= maxRetries) {
        throw new BootRetryExhaustedError(
          `Failed after ${maxRetries + 1} attempts`,
          strategiesUsed,
          lastError
        );
      }
    }
  }

  throw new BootRetryExhaustedError(
    `Failed after ${maxRetries + 1} attempts`,
    strategiesUsed,
    lastError
  );
}

export class BootRetryExhaustedError extends Error {
  public strategiesUsed: RetryStrategy[];
  public lastError: string;

  constructor(message: string, strategiesUsed: RetryStrategy[], lastError: string) {
    super(message);
    this.name = "BootRetryExhaustedError";
    this.strategiesUsed = strategiesUsed;
    this.lastError = lastError;
  }
}

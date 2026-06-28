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

const STRATEGIES: Record<RetryStrategy, StrategyConfig> = {
  normal: {
    flags: ["--no-audit", "--no-fund", "--prefer-offline"],
    label: "Normal install",
  },
  "legacy-peers": {
    flags: ["--no-audit", "--no-fund", "--prefer-offline", "--legacy-peer-deps"],
    label: "Legacy peer deps mode",
  },
  force: {
    flags: ["--no-audit", "--no-fund", "--force"],
    label: "Force mode",
  },
  "no-optional": {
    flags: ["--no-audit", "--no-fund", "--prefer-offline", "--no-optional"],
    label: "Skipping optional deps",
  },
  "ignore-scripts": {
    flags: ["--no-audit", "--no-fund", "--prefer-offline", "--ignore-scripts"],
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
];

export function getRetryDelay(attempt: number, baseDelayMs: number): number {
  return Math.min(Math.max(1000, baseDelayMs * Math.pow(2, attempt - 1)), 10_000);
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
      const delayMs = getRetryDelay(attempt, baseDelayMs);

      onRetry(attempt, lastError, currentStrategy);

      if (teardown) {
        await teardown();
      }

      // Additional settle time for WebContainer process registry to clear
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

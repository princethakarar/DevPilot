/**
 * Hard caps for a single autonomous run — enforced in code by the
 * orchestrator, never left to a prompt instruction the model could ignore.
 */
export const AGENT_CAPS = {
  maxToolCalls: 25,
  maxWallClockMs: 5 * 60 * 1000,
  /** Rough cost ceiling. No tokenizer dependency — ~4 chars/token, same approximation the inline-completion budget uses. */
  maxApproxTokens: 150_000,
} as const;

const STALL_THRESHOLD = 3;

/**
 * Cheap, deterministic fingerprint of a failure: prefer a "file:line" locator
 * if the output has one (the common case for build/test/type-check errors),
 * combined with an error-message fragment; falls back to the first non-empty
 * output line. Not meant to be a precise parser for every tool's output
 * format — just consistent enough that the SAME underlying failure hashes the
 * same way across consecutive attempts.
 */
function extractErrorSignature(output: string): string {
  const fileLine = output.match(/([\w./\\-]+\.[a-zA-Z]+):(\d+)(?::\d+)?/);
  const errorMsg = output.match(/(?:Error(?:Type)?|Exception|FAIL)[:\s]+([^\n]{1,120})/i);
  const parts = [
    fileLine ? `${fileLine[1]}:${fileLine[2]}` : null,
    errorMsg ? errorMsg[1].trim().toLowerCase() : null,
  ].filter((p): p is string => !!p);

  if (parts.length === 0) {
    const firstLine = output.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
    return firstLine.slice(0, 200).toLowerCase();
  }
  return parts.join("|");
}

export interface StallRecord {
  signature: string;
  streak: number;
  stalled: boolean;
}

/**
 * Tracks consecutive failing-command signatures across a run's iterations. If
 * the SAME signature repeats `STALL_THRESHOLD` times in a row, the run is
 * "stalled" — the orchestrator stops and reports it as blocked instead of
 * burning the rest of the iteration budget on a stuck loop.
 */
export class StallTracker {
  private lastSignature: string | null = null;
  private streak = 0;

  recordFailure(output: string): StallRecord {
    const signature = extractErrorSignature(output);
    this.streak = signature === this.lastSignature ? this.streak + 1 : 1;
    this.lastSignature = signature;
    return { signature, streak: this.streak, stalled: this.streak >= STALL_THRESHOLD };
  }

  recordSuccess(): void {
    this.lastSignature = null;
    this.streak = 0;
  }
}

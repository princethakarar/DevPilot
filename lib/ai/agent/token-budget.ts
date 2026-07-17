import type { AgentModelMessage } from "./model-client";

/**
 * Global (app-wide, not per-run/per-user) proactive pacer for Groq's
 * qwen/qwen3-32b TPM budget. Phase 0 measurement confirmed the 6000 TPM
 * limit is scoped to the org+model, not the task or the user — a live run
 * showed ~1650 tokens of "Used" budget from an unrelated source before this
 * run's own first call had even completed. A per-run tracker would miss
 * that; this one is a single module-level ledger shared by every call this
 * Next.js process makes, same single-process tradeoff already accepted by
 * lib/ai/rate-limiter.ts and lib/ai/agent/relay.ts — not multi-instance-safe,
 * fine for this app's current deployment.
 *
 * This is prevention, not the only defense: rate-limit-retry.ts's reactive
 * 429/413 handling stays in place as a fallback for whatever this can't
 * catch (a concurrent process outside this one, an estimate that undershoots).
 */

export const TPM_LIMIT_ESTIMATE = 6000;
export const TPM_SAFETY_RATIO = 0.8;
// AGENT_TOOLS' JSON (~700 tokens measured) is sent on every call but isn't
// part of `messages` itself, so the char/4 estimate over `messages` alone
// would undercount every request by that much.
export const TOOL_SCHEMA_TOKEN_OVERHEAD = 700;

const WINDOW_MS = 60_000;
// Must comfortably clear WINDOW_MS: the wait this is actually bounding is
// "until the oldest ledger entry ages out of the 60s window," which for a
// budget-heavy turn can genuinely take close to the full 60s. Measured live:
// a real 3rd-turn call needed ~58s before it fit — a 65s cap left only ~7s
// of margin, uncomfortably close to giving up right before succeeding.
const MAX_PACING_WAIT_MS = 75_000;
const POLL_INTERVAL_MS = 2_000;

export function estimateRequestTokens(messages: AgentModelMessage[]): number {
  return Math.ceil(JSON.stringify(messages).length / 4) + TOOL_SCHEMA_TOKEN_OVERHEAD;
}

interface LedgerEntry {
  id: number;
  tokens: number;
  ts: number;
}

let ledger: LedgerEntry[] = [];
let nextId = 1;

function usedTokens(now: number): number {
  const cutoff = now - WINDOW_MS;
  ledger = ledger.filter((e) => e.ts > cutoff);
  return ledger.reduce((sum, e) => sum + e.tokens, 0);
}

/**
 * Reserves an estimated token cost against the window BEFORE the real
 * network call fires, so two calls racing through the same tick (two
 * concurrent runs) don't both see room and both fire. Returns a handle to
 * reconcile afterward — callers MUST call finalizeReservation (success) or
 * releaseReservation (the call never actually billed tokens) or the ledger
 * permanently overcounts.
 */
export function reserveEstimate(tokens: number): number {
  const id = nextId++;
  ledger.push({ id, tokens, ts: Date.now() });
  return id;
}

/** Replaces a reservation's estimate with the provider's real reported usage. */
export function finalizeReservation(id: number, actualTokens: number): void {
  const entry = ledger.find((e) => e.id === id);
  if (entry) entry.tokens = actualTokens;
}

/** Drops a reservation entirely — the call failed before Groq billed anything for it. */
export function releaseReservation(id: number): void {
  ledger = ledger.filter((e) => e.id !== id);
}

/**
 * Blocks until `estimatedTokens` plausibly fits under the safety-margined
 * budget for the current rolling window, polling every POLL_INTERVAL_MS and
 * reporting each wait via `onWait` so callers can surface a live "pacing
 * request..." status instead of a silent stall. Gives up after
 * MAX_PACING_WAIT_MS (about one full window) and lets the caller proceed
 * anyway — at that point the reactive 429 retry is the fallback, not this.
 */
export async function waitForTokenBudget(
  estimatedTokens: number,
  onWait: (waitMs: number, usedTokens: number, budget: number) => void | Promise<void>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<void> {
  const budget = TPM_LIMIT_ESTIMATE * TPM_SAFETY_RATIO;
  const start = Date.now();
  while (true) {
    const now = Date.now();
    const used = usedTokens(now);
    if (used + estimatedTokens <= budget) return;
    if (now - start >= MAX_PACING_WAIT_MS) return;
    const waitMs = Math.min(POLL_INTERVAL_MS, MAX_PACING_WAIT_MS - (now - start));
    await onWait(waitMs, used, budget);
    await sleep(waitMs);
  }
}

/** Test-only: resets the module-level ledger between test cases. */
export function __resetTokenBudgetForTests(): void {
  ledger = [];
  nextId = 1;
}

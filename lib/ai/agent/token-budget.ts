import type { AgentModelMessage } from "./model-client";
import { limitsForModel } from "./model-limits";

/**
 * Global (app-wide, not per-run/per-user) proactive pacer for the agent
 * model's Groq TPM (tokens-per-minute) budget. The budget is scoped to
 * org+model, not to a task or a user — a live run showed ~1650 tokens of
 * "Used" budget from an unrelated source before that run's own first call had
 * even completed. A per-run tracker would miss that; this is a single
 * module-level ledger shared by every call this Next.js process makes, the
 * same single-process tradeoff already accepted by lib/ai/rate-limiter.ts and
 * lib/ai/agent/relay.ts — not multi-instance-safe, fine for this deployment.
 *
 * THE CENTRAL FACT THIS MODULE EXISTS TO GET RIGHT: Groq applies TWO
 * different token counts, and the previous implementation only modelled one
 * of them.
 *
 *  1. ADMISSION uses `prompt_tokens + max_tokens`. The provider states this
 *     itself in its own error bodies — "Limit 6000, Requested 7516" for a
 *     3,420-token prompt sent with max_tokens 4096, and "Requested 3676" for
 *     a 1,176-token prompt sent with max_tokens 2500. A request whose
 *     prompt + max_tokens exceeds the limit is rejected outright with a 413,
 *     no matter how idle the window is, and the model never runs.
 *  2. CONSUMPTION uses actual `usage.total_tokens`. Measured directly: a
 *     max_tokens=2500 call whose completion was 2 tokens moved
 *     `x-ratelimit-remaining-tokens` by 81, not by 2,542 — the unused part of
 *     the ceiling is not kept.
 *
 *     On that 81: the call's own usage was 44, and the remaining ~37 is the
 *     cost of the baseline probe taken immediately before it. The header
 *     reading therefore lags by roughly one request's settlement, and the
 *     bucket also refills continuously (limit/60 per second — the dip was
 *     back at the cap by the next sample 1.6s later). So this counter is a
 *     decent order-of-magnitude signal and a poor per-call ledger, which is
 *     why the verification harness gates on estimator accuracy rather than on
 *     header deltas. None of that weakens the conclusion drawn here: had the
 *     2,500 ceiling been retained, restoring a 2,542-token dip at 100
 *     tokens/second would have taken ~25 seconds, and it was observed fully
 *     restored in under 2.
 *
 * So: reserve the ADMISSION figure before firing (that is the number that
 * decides whether the call is even allowed, and holding it in-flight is what
 * stops two concurrent calls from both being admitted into headroom only one
 * of them can have), then settle the entry down to real consumption once the
 * response lands.
 *
 * What was actually broken before was the reservation, not the settlement:
 * the pre-flight estimate omitted max_tokens entirely and under-counted the
 * prompt by ~22% (chars/4), so a request needing 3,676 tokens of admission
 * headroom was checked as if it needed 1,212. The pacer therefore approved
 * calls Groq then rejected, which is the 429/413 the pacer exists to prevent.
 */

export const TPM_SAFETY_RATIO = 0.8;

/**
 * Ceiling on a single response, sent as `max_tokens` and — because Groq
 * reserves it up front — charged against TPM on every call whether the model
 * uses it or not. This is the single source of truth: model-client.ts sends
 * it and this module reserves it, so the request and the ledger cannot drift.
 *
 * 2500 rather than the previous 4096. Measured across all 487 starter code
 * files, 2500 covers ~97% of whole-file write_file calls (p95 = 1,922 tokens
 * to rewrite a file); 4096 covered ~98.8%. That 1.8-point difference costs
 * far less than 4096 did on the fallback model, where 6,000 TPM minus a 4,096
 * reservation left 1,904 tokens of prompt headroom against a measured 1,547-
 * token fixed floor — i.e. effectively unusable. See docs and the Phase 1
 * proposal for the full distribution.
 */
export const MAX_COMPLETION_TOKENS = 2500;

/**
 * Measured against Groq's tokenizer on this app's real payloads: a mixed
 * JSON+prose+code request came out at 3.37 chars/token, and TSX source inside
 * a JSON string at 3.46. The previous implicit divisor of 4 undercounted a
 * real request by ~22% (estimated 1,212 against an actual 1,547).
 *
 * Note this is deliberately a blunt average. CSS tokenizes far denser
 * (measured 2.33 chars/token — punctuation, hex colours, short identifiers),
 * so a CSS-heavy request still under-estimates. That residual error is
 * absorbed by TPM_SAFETY_RATIO, not by trying to tokenize per content type.
 */
export const CHARS_PER_TOKEN = 3.4;

/**
 * Fixed per-request cost that isn't part of `messages` at all: AGENT_TOOLS'
 * JSON (~3,170 chars of schema) plus the chat-template and tool-calling
 * preamble the provider wraps every request in. Was 700, which counted only a
 * rough guess at the schema.
 *
 * Calibrated against three live turns whose real prompt_tokens were 1,176 /
 * 1,230 / 1,285: solving for the fixed component puts it near 1,120, and 1000
 * with CHARS_PER_TOKEN's conservative divisor lands the *admission* estimate
 * (the number that actually gates a request) within ~2% of the provider's own
 * figure on all three. Erring slightly high is the safe direction here — an
 * over-estimate costs a little throughput, an under-estimate costs the 429
 * this module exists to prevent.
 */
export const TOOL_SCHEMA_TOKEN_OVERHEAD = 1000;

const WINDOW_MS = 60_000;
// Must comfortably clear WINDOW_MS: the wait this bounds is "until the oldest
// ledger entry ages out of the 60s window", which for a budget-heavy turn can
// genuinely take close to the full 60s. Measured live: a real 3rd-turn call
// needed ~58s before it fit — a 65s cap left only ~7s of margin.
const MAX_PACING_WAIT_MS = 75_000;
const POLL_INTERVAL_MS = 2_000;

/** What we send: the prompt side of the request only. */
export function estimatePromptTokens(messages: AgentModelMessage[]): number {
  return Math.ceil(JSON.stringify(messages).length / CHARS_PER_TOKEN) + TOOL_SCHEMA_TOKEN_OVERHEAD;
}

/**
 * What Groq actually bills against TPM: the prompt plus the reserved
 * completion ceiling. This — not estimatePromptTokens — is what belongs in
 * the ledger and in any "will this fit?" check.
 */
export function estimateBilledTokens(
  messages: AgentModelMessage[],
  maxCompletionTokens: number = MAX_COMPLETION_TOKENS
): number {
  return estimatePromptTokens(messages) + maxCompletionTokens;
}

/**
 * Whether this request would exceed the safe share of `model`'s TPM budget —
 * the trigger for shedding context before sending rather than after a 413.
 */
export function exceedsSafeBudget(messages: AgentModelMessage[], model: string): boolean {
  return estimateBilledTokens(messages) > limitsForModel(model).tpm * TPM_SAFETY_RATIO;
}

interface LedgerEntry {
  id: number;
  tokens: number;
  ts: number;
}

/**
 * Handle returned by reserveEstimate. Carries the model so the reconcile and
 * release paths can find their entry without scanning every model's ledger.
 */
export interface Reservation {
  id: number;
  model: string;
}

/**
 * Keyed by model, because the two models have entirely SEPARATE TPM windows.
 * A single shared array counted a fallback-model call against the primary's
 * budget and vice versa, so a run that switched models paced itself against a
 * window it was no longer spending from.
 */
let ledger = new Map<string, LedgerEntry[]>();
let nextId = 1;

function usedTokens(now: number, model: string): number {
  const cutoff = now - WINDOW_MS;
  const entries = (ledger.get(model) ?? []).filter((e) => e.ts > cutoff);
  if (entries.length > 0) ledger.set(model, entries);
  else ledger.delete(model);
  return entries.reduce((sum, e) => sum + e.tokens, 0);
}

/**
 * Reserves a call's billed cost against `model`'s window BEFORE the network
 * call fires, so two calls racing through the same tick (two concurrent runs)
 * don't both see room and both fire. Callers MUST follow up with
 * reconcileReservation (the call went through) or releaseReservation (it
 * never billed) or the ledger permanently overcounts.
 *
 * `tokens` should be estimateBilledTokens(...), not a prompt-only estimate.
 */
export function reserveEstimate(tokens: number, model: string): Reservation {
  const id = nextId++;
  const entries = ledger.get(model) ?? [];
  entries.push({ id, tokens, ts: Date.now() });
  ledger.set(model, entries);
  return { id, model };
}

/**
 * Settles a completed call's entry down from the admission reservation to
 * what the exchange actually consumed (`usage.total_tokens`).
 *
 * The large reservation has already done its job by this point: it was held
 * for the whole in-flight window, which is what prevents a concurrent call
 * from being admitted into headroom this one might still have needed. Once
 * the response has landed that headroom is provably free again, and leaving
 * the full ceiling on the books would idle the pacer against budget the
 * provider is no longer holding either.
 */
export function reconcileReservation(reservation: Reservation, settledTokens: number): void {
  const entry = ledger.get(reservation.model)?.find((e) => e.id === reservation.id);
  if (entry) entry.tokens = settledTokens;
}

/** Drops a reservation entirely — the call failed before Groq billed anything for it. */
export function releaseReservation(reservation: Reservation): void {
  const entries = ledger.get(reservation.model);
  if (!entries) return;
  const remaining = entries.filter((e) => e.id !== reservation.id);
  if (remaining.length > 0) ledger.set(reservation.model, remaining);
  else ledger.delete(reservation.model);
}

/** Current in-window consumption for a model — exported for the verification harness. */
export function ledgerUsageForModel(model: string): number {
  return usedTokens(Date.now(), model);
}

/**
 * Blocks until `estimatedTokens` plausibly fits under the safety-margined
 * budget for `model`'s current rolling window, polling every POLL_INTERVAL_MS
 * and reporting each wait via `onWait` so callers can surface a live "pacing
 * request…" status instead of a silent stall. Gives up after
 * MAX_PACING_WAIT_MS (about one full window) and lets the caller proceed
 * anyway — at that point the reactive 429 retry is the fallback, not this.
 */
export async function waitForTokenBudget(
  estimatedTokens: number,
  model: string,
  onWait: (waitMs: number, usedTokens: number, budget: number) => void | Promise<void>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  // Checked every poll tick so a user-requested stop can end this wait (up to
  // MAX_PACING_WAIT_MS ~75s) immediately rather than at its next 2s poll at
  // the latest — the caller is expected to treat return-while-aborted as
  // "stop, don't actually fire the call."
  shouldStop?: () => boolean
): Promise<void> {
  const budget = limitsForModel(model).tpm * TPM_SAFETY_RATIO;
  const start = Date.now();
  while (true) {
    if (shouldStop?.()) return;
    const now = Date.now();
    const used = usedTokens(now, model);
    if (used + estimatedTokens <= budget) return;
    if (now - start >= MAX_PACING_WAIT_MS) return;
    const waitMs = Math.min(POLL_INTERVAL_MS, MAX_PACING_WAIT_MS - (now - start));
    await onWait(waitMs, used, budget);
    await sleep(waitMs);
  }
}

/** Test-only: resets the module-level ledger between test cases. */
export function __resetTokenBudgetForTests(): void {
  ledger = new Map();
  nextId = 1;
}

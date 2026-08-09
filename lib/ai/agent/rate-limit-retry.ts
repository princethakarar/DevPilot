import {
  callAgentModel,
  resolvePrimaryModel,
  resolveFallbackModel,
  type AgentModelMessage,
  type AgentModelResult,
  AgentModelError,
  AgentModelUnavailableError,
  AgentRateLimitError,
  AgentResponseTruncatedError,
  AgentToolCallGenerationError,
} from "./model-client";
import { trimToolResultHistory } from "./context-trim";
import { exceedsSafeBudget } from "./token-budget";

export const MAX_RATE_LIMIT_RETRIES = 3;
export const RATE_LIMIT_JITTER_MS = 1000;
export const DEFAULT_RATE_LIMIT_WAIT_SECONDS = 15;

// Tool-call generation failures (Groq: "Failed to call a function. Please
// adjust your prompt.") are a per-turn model hiccup, not a rate/quota issue —
// confirmed live to often succeed on an immediate retry of the exact same
// messages. A short, fixed backoff is enough; no need for the rate limiter's
// provider-given wait times.
export const MAX_TOOL_CALL_GEN_RETRIES = 2;
export const TOOL_CALL_GEN_RETRY_WAIT_MS = 1500;

export type ModelCallOutcome =
  | { ok: true; result: AgentModelResult }
  | { ok: false; reason: string; failedGeneration?: string | null };

/**
 * Whether this run has switched to the fallback model yet. A plain mutable
 * object (not a return value) because the caller (orchestrator.ts) creates
 * ONE of these per run and passes the same instance into every turn's
 * callModelWithRateLimitHandling call — once a turn switches, every later
 * turn in the same run starts on the fallback too, instead of retrying the
 * already-known-bad primary from scratch every time.
 */
export interface ModelFallbackState {
  usingFallback: boolean;
}

export function createModelFallbackState(): ModelFallbackState {
  return { usingFallback: false };
}

/**
 * Why an escalation attempt did or didn't happen.
 *  - "switched": now on the fallback, retry the call.
 *  - "unavailable": already on the fallback, or no distinct one is configured.
 *  - "insufficient-headroom": a distinct fallback exists but this request is
 *    too large for its rate limit, so it was skipped rather than attempted.
 */
export type FallbackDecision = "switched" | "unavailable" | "insufficient-headroom";

/**
 * Which model a run is currently on. Callers outside this module (the
 * orchestrator's pre-send budget check) need it to pick the right TPM ceiling
 * — the primary's is double the fallback's, so "which model" is not a detail
 * they can skip.
 */
export function activeModel(state: ModelFallbackState): string {
  return state.usingFallback ? resolveFallbackModel() : resolvePrimaryModel();
}

const STOPPED_OUTCOME: ModelCallOutcome = { ok: false, reason: "Stopped by user request." };

/**
 * A daily quota needs a different message from a per-minute one: "try again
 * in a minute" is actively misleading when the real answer is "not until this
 * evening". Uses the provider's own reset estimate when it gave one — which
 * it now reliably does, since parseWaitSeconds understands the "13m40.8s"
 * form these errors are written in.
 */
function describeDailyExhaustion(waitSeconds: number | null): string {
  const base = "Your Groq daily token quota is exhausted, so the agent can't run any more steps today.";
  if (waitSeconds === null) return `${base} It resets on a rolling 24-hour window.`;
  const minutes = Math.ceil(waitSeconds / 60);
  return minutes >= 60
    ? `${base} Quota frees up in about ${Math.round(minutes / 60)}h.`
    : `${base} Quota frees up in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

// Backoff waits here can run up to MAX_RATE_LIMIT_RETRIES * ~45s — chunking
// the injected `sleep` into short steps and rechecking stopSignal between
// each one is what lets a mid-backoff Stop click take effect within
// STOP_CHECK_INTERVAL_MS instead of waiting out the rest of the backoff.
const STOP_CHECK_INTERVAL_MS = 500;

async function interruptibleSleep(ms: number, sleep: (ms: number) => Promise<void>, stopSignal?: AbortSignal): Promise<void> {
  if (!stopSignal) {
    await sleep(ms);
    return;
  }
  let waited = 0;
  while (waited < ms) {
    if (stopSignal.aborted) return;
    const chunk = Math.min(STOP_CHECK_INTERVAL_MS, ms - waited);
    await sleep(chunk);
    waited += chunk;
  }
}

/**
 * Wraps callAgentModel with the provider's two distinct rate-limit failure
 * modes (see AgentRateLimitError's doc comment): a "rate_limited" error
 * waits out the provider-given duration and resends as-is; a "too_large"
 * error means resending unchanged will fail again regardless of wait, so it
 * forces an aggressive trim (drop even the most recent tool result) before
 * retrying. Also retries AgentToolCallGenerationError (the model failed to
 * produce a valid tool call for this specific turn) a couple of times before
 * giving up, since that's usually transient rather than permanent.
 *
 * Layered on top of same-model retries is a one-time fallback-model switch
 * (fallbackState, shared across every turn of the run — see
 * ModelFallbackState's doc comment): AgentModelUnavailableError (the
 * configured model is gone/renamed) switches immediately, since retrying an
 * unavailable model is pointless; exhausting either the rate-limit or
 * tool-call-generation retries above switches instead of giving up, since a
 * different model has its own separate TPM budget and its own tool-calling
 * reliability. Only ever switches once — if the fallback ALSO hits one of
 * these, that's reported as a final failure exactly like exhausting retries
 * on a single model always has: a plain reason string (or, for
 * AgentModelUnavailableError, a rethrown error) routed through the same
 * clean-stop path as mark_blocked, never a raw error/dead state.
 *
 * `messages` is mutated in place on a "too_large" trim, same array the
 * caller keeps using afterward. `sleep` is injectable so tests don't
 * actually wait out real retry delays.
 */
export async function callModelWithRateLimitHandling(
  messages: AgentModelMessage[],
  onStatus: (message: string) => void | Promise<void>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  stopSignal?: AbortSignal,
  fallbackState: ModelFallbackState = createModelFallbackState()
): Promise<ModelCallOutcome> {
  const primaryModel = resolvePrimaryModel();
  const fallbackModel = resolveFallbackModel();
  const canFallBack = fallbackModel !== primaryModel;

  let rateLimitAttempt = 0;
  let toolCallGenAttempt = 0;
  let lastFailedGeneration: string | null = null;

  /**
   * Switches this run to the fallback model, but only if that model can
   * actually hold the request. Resets the same-model attempt counters, and
   * only ever succeeds the first time it's called for a given run.
   *
   * The headroom gate is the point. The fallback is the SMALLER model — 6,000
   * TPM against the primary's 12,000 — so at the current completion ceiling
   * it has roughly 2,300 tokens of prompt headroom, while a measured baseline
   * turn on a trivial four-file tree already runs 1,176-1,285 tokens before
   * any real task context. Escalating a request the fallback cannot admit
   * doesn't rescue the run: the call is rejected on arrival, and the run ends
   * on a confusing "too large" from a model the user never chose instead of
   * the real reason. Checking first costs nothing and fails honestly.
   *
   * Uses exceedsSafeBudget — the same predicate the orchestrator applies to
   * the active model before each turn — so "does it fit?" has exactly one
   * definition (token-budget.ts) rather than a second copy that can drift.
   */
  const switchToFallback = async (fromModel: string, reasonMessage: string): Promise<FallbackDecision> => {
    if (fallbackState.usingFallback || !canFallBack) return "unavailable";
    if (exceedsSafeBudget(messages, fallbackModel)) {
      await onStatus(
        `${reasonMessage}, but this request is too large for the fallback model ("${fallbackModel}") to accept — not attempting it.`
      );
      return "insufficient-headroom";
    }
    fallbackState.usingFallback = true;
    rateLimitAttempt = 0;
    toolCallGenAttempt = 0;
    await onStatus(`${reasonMessage} — switching from "${fromModel}" to fallback model "${fallbackModel}"…`);
    return "switched";
  };

  /** Appended to a final failure reason so a skipped fallback is visible, not silent. */
  const headroomNote = (decision: FallbackDecision): string =>
    decision === "insufficient-headroom"
      ? ` The smaller fallback model ("${fallbackModel}") was skipped because this request exceeds its rate limit — reduce the task's scope or let the agent work on fewer files at a time.`
      : "";

  while (true) {
    if (stopSignal?.aborted) return STOPPED_OUTCOME;
    const model = fallbackState.usingFallback ? fallbackModel : primaryModel;
    try {
      const result = await callAgentModel(messages, onStatus, stopSignal, model);
      return { ok: true, result };
    } catch (err) {
      if (stopSignal?.aborted) return STOPPED_OUTCOME;

      if (err instanceof AgentModelUnavailableError) {
        const decision = await switchToFallback(model, "Configured model unavailable");
        if (decision === "switched") continue;
        // Already on the fallback, no distinct fallback configured, or the
        // fallback is too small for this request — nothing left to switch to.
        if (decision === "insufficient-headroom") {
          throw new AgentModelError(`${err.message}${headroomNote(decision)}`);
        }
        throw canFallBack
          ? err
          : new AgentModelError(`${err.message} No distinct fallback model is configured (AGENT_GROQ_FALLBACK_MODEL).`);
      }

      // Non-retryable by construction, and not a reason to change models: the
      // cap is ours (MAX_COMPLETION_TOKENS), identical on every model, so a
      // retry regenerates the same over-long content and hits the same wall
      // — while paying a full prompt+ceiling charge for the privilege. End
      // the turn with the error's own actionable message instead.
      if (err instanceof AgentResponseTruncatedError) {
        return { ok: false, reason: err.message };
      }

      if (err instanceof AgentToolCallGenerationError) {
        toolCallGenAttempt += 1;
        lastFailedGeneration = err.failedGeneration;
        if (toolCallGenAttempt > MAX_TOOL_CALL_GEN_RETRIES) {
          const decision = await switchToFallback(model, `"${model}" repeatedly failed to generate a valid tool call`);
          if (decision === "switched") continue;
          return {
            ok: false,
            reason:
              "The AI model repeatedly failed to generate a valid tool call for this step. Try rephrasing the task or breaking it into smaller steps." +
              headroomNote(decision),
            // Groq's raw (often truncated) attempt at the tool call — not
            // shown to the user, but logged by the caller so a repeat of
            // this failure is diagnosable (e.g. cut off mid-JSON because of
            // max_tokens) instead of a guess.
            failedGeneration: lastFailedGeneration,
          };
        }
        await onStatus(`The model produced an invalid tool call — retrying (attempt ${toolCallGenAttempt}/${MAX_TOOL_CALL_GEN_RETRIES})…`);
        await interruptibleSleep(TOOL_CALL_GEN_RETRY_WAIT_MS, sleep, stopSignal);
        continue;
      }

      if (!(err instanceof AgentRateLimitError)) throw err;

      // The DAILY quota is gone, so waiting is not a strategy: the provider's
      // own stated wait for this has been measured at 13-22 minutes, against
      // an AGENT_CAPS.maxWallClockMs of 5. Skip the same-model retry ladder
      // entirely — those attempts cannot succeed and each one still costs a
      // full prompt+ceiling charge against a quota that is already the
      // problem. Hand straight to the fallback, which has its own separate
      // daily budget, and otherwise stop with something the user can act on.
      //
      // The escalation itself is gated on the fallback actually being able to
      // hold the request — see switchToFallback.
      if (err.kind === "daily_exhausted") {
        const decision = await switchToFallback(model, `Daily token quota exhausted on "${model}"`);
        if (decision === "switched") continue;
        return { ok: false, reason: describeDailyExhaustion(err.waitSeconds) + headroomNote(decision) };
      }

      rateLimitAttempt += 1;
      if (rateLimitAttempt > MAX_RATE_LIMIT_RETRIES) {
        const decision = await switchToFallback(model, `Rate limit exceeded on "${model}"`);
        if (decision === "switched") continue;
        return {
          ok: false,
          reason:
            "Task paused — AI provider rate limit exceeded. Try again in a minute, or reduce task scope." +
            headroomNote(decision),
        };
      }

      if (err.kind === "too_large") {
        trimToolResultHistory(messages, 0);
      }

      const waitMs = (err.waitSeconds ?? DEFAULT_RATE_LIMIT_WAIT_SECONDS) * 1000 + RATE_LIMIT_JITTER_MS;
      await onStatus(`Rate limited by the AI provider — retrying in ${Math.ceil(waitMs / 1000)}s (attempt ${rateLimitAttempt}/${MAX_RATE_LIMIT_RETRIES})…`);
      await interruptibleSleep(waitMs, sleep, stopSignal);
    }
  }
}

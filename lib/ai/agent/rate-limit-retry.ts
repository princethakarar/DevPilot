import {
  callAgentModel,
  resolvePrimaryModel,
  resolveFallbackModel,
  type AgentModelMessage,
  type AgentModelResult,
  AgentModelError,
  AgentModelUnavailableError,
  AgentRateLimitError,
  AgentToolCallGenerationError,
} from "./model-client";
import { trimToolResultHistory } from "./context-trim";

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

const STOPPED_OUTCOME: ModelCallOutcome = { ok: false, reason: "Stopped by user request." };

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

  /** True, and resets same-model attempt counters, only the first time this is called for a given run. */
  const switchToFallback = async (fromModel: string, reasonMessage: string): Promise<boolean> => {
    if (fallbackState.usingFallback || !canFallBack) return false;
    fallbackState.usingFallback = true;
    rateLimitAttempt = 0;
    toolCallGenAttempt = 0;
    await onStatus(`${reasonMessage} — switching from "${fromModel}" to fallback model "${fallbackModel}"…`);
    return true;
  };

  while (true) {
    if (stopSignal?.aborted) return STOPPED_OUTCOME;
    const model = fallbackState.usingFallback ? fallbackModel : primaryModel;
    try {
      const result = await callAgentModel(messages, onStatus, stopSignal, model);
      return { ok: true, result };
    } catch (err) {
      if (stopSignal?.aborted) return STOPPED_OUTCOME;

      if (err instanceof AgentModelUnavailableError) {
        if (await switchToFallback(model, "Configured model unavailable")) continue;
        // Already on the fallback (or there's no distinct fallback to try) — nothing left to switch to.
        throw canFallBack
          ? err
          : new AgentModelError(`${err.message} No distinct fallback model is configured (AGENT_GROQ_FALLBACK_MODEL).`);
      }

      if (err instanceof AgentToolCallGenerationError) {
        toolCallGenAttempt += 1;
        lastFailedGeneration = err.failedGeneration;
        if (toolCallGenAttempt > MAX_TOOL_CALL_GEN_RETRIES) {
          if (await switchToFallback(model, `"${model}" repeatedly failed to generate a valid tool call`)) continue;
          return {
            ok: false,
            reason:
              "The AI model repeatedly failed to generate a valid tool call for this step. Try rephrasing the task or breaking it into smaller steps.",
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

      rateLimitAttempt += 1;
      if (rateLimitAttempt > MAX_RATE_LIMIT_RETRIES) {
        if (await switchToFallback(model, `Rate limit exceeded on "${model}"`)) continue;
        return {
          ok: false,
          reason: "Task paused — AI provider rate limit exceeded. Try again in a minute, or reduce task scope.",
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

import { callAgentModel, type AgentModelMessage, type AgentModelResult, AgentRateLimitError } from "./model-client";
import { trimToolResultHistory } from "./context-trim";

export const MAX_RATE_LIMIT_RETRIES = 3;
export const RATE_LIMIT_JITTER_MS = 1000;
export const DEFAULT_RATE_LIMIT_WAIT_SECONDS = 15;

export type ModelCallOutcome = { ok: true; result: AgentModelResult } | { ok: false; reason: string };

/**
 * Wraps callAgentModel with the provider's two distinct rate-limit failure
 * modes (see AgentRateLimitError's doc comment): a "rate_limited" error
 * waits out the provider-given duration and resends as-is; a "too_large"
 * error means resending unchanged will fail again regardless of wait, so it
 * forces an aggressive trim (drop even the most recent tool result) before
 * retrying. Capped at MAX_RATE_LIMIT_RETRIES — exhausting it is reported
 * back as a plain reason string, which the caller routes through the exact
 * same clean-stop path as mark_blocked, never a raw error/dead state.
 *
 * `messages` is mutated in place on a "too_large" trim, same array the
 * caller keeps using afterward. `sleep` is injectable so tests don't
 * actually wait out real retry delays.
 */
export async function callModelWithRateLimitHandling(
  messages: AgentModelMessage[],
  onStatus: (message: string) => void | Promise<void>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): Promise<ModelCallOutcome> {
  let attempt = 0;
  while (true) {
    try {
      const result = await callAgentModel(messages, onStatus);
      return { ok: true, result };
    } catch (err) {
      if (!(err instanceof AgentRateLimitError)) throw err;

      attempt += 1;
      if (attempt > MAX_RATE_LIMIT_RETRIES) {
        return {
          ok: false,
          reason: "Task paused — AI provider rate limit exceeded. Try again in a minute, or reduce task scope.",
        };
      }

      if (err.kind === "too_large") {
        trimToolResultHistory(messages, 0);
      }

      const waitMs = (err.waitSeconds ?? DEFAULT_RATE_LIMIT_WAIT_SECONDS) * 1000 + RATE_LIMIT_JITTER_MS;
      await onStatus(`Rate limited by the AI provider — retrying in ${Math.ceil(waitMs / 1000)}s (attempt ${attempt}/${MAX_RATE_LIMIT_RETRIES})…`);
      await sleep(waitMs);
    }
  }
}

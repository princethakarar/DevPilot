/**
 * Coding-agent LLM router with automatic model-level fallback on Groq.
 *
 * Callers (orchestrator, API routes) import callCodingAgent and never need
 * to know which model handled any given request.
 *
 * Routing logic:
 *  1. Try Groq with model "openai/gpt-oss-120b"
 *  2. On { code: "rate_limit" } → retry on Groq with "qwen/qwen3.8-27b"
 *  3. If that also fails → throw with a clear, user-readable message
 *
 * Both attempts use the same GROQ_API_KEY and baseURL — only the model
 * string changes. A console.warn fires whenever the fallback is triggered.
 */

import { callLLM, LLMError, type LLMMessage, type LLMOptions, type LLMResponse } from "./client";

// Re-export so callers that already import from here don't need a second import.
export type { LLMMessage, LLMOptions, LLMResponse };

const PRIMARY_MODEL = "openai/gpt-oss-120b";
const FALLBACK_MODEL = "qwen/qwen3.8-27b";

/**
 * Calls the coding agent LLM layer.
 *
 * Primary  → Groq / openai/gpt-oss-120b
 * Fallback → Groq / qwen/qwen3.8-27b  (on 429 only)
 *
 * options.stream=true is supported: the raw Response is returned so the
 * caller can pipe the SSE stream without buffering.
 */
export async function callCodingAgent(
  messages: LLMMessage[],
  options: LLMOptions & { stream: true }
): Promise<Response>;
export async function callCodingAgent(
  messages: LLMMessage[],
  options?: LLMOptions & { stream?: false }
): Promise<LLMResponse>;
export async function callCodingAgent(
  messages: LLMMessage[],
  options: LLMOptions = {}
): Promise<LLMResponse | Response> {
  // ── Primary: Groq / openai/gpt-oss-120b ────────────────────────────────
  try {
    if (options.stream) {
      return await callLLM("groq", messages, { ...options, stream: true, model: PRIMARY_MODEL });
    }
    return await callLLM("groq", messages, { ...options, model: PRIMARY_MODEL });
  } catch (err) {
    // Only fall through on rate-limit. Any other failure propagates immediately.
    if (!(err instanceof LLMError) || err.code !== "rate_limit") {
      throw err;
    }

    console.warn(
      `[callCodingAgent] Groq rate limited on "${PRIMARY_MODEL}" — falling back to "${FALLBACK_MODEL}".`,
      `retryAfter=${err.retryAfter ?? "unknown"}s`
    );
  }

  // ── Fallback: Groq / qwen/qwen3.8-27b ─────────────────────────────────
  try {
    if (options.stream) {
      return await callLLM("groq", messages, { ...options, stream: true, model: FALLBACK_MODEL });
    }
    return await callLLM("groq", messages, { ...options, model: FALLBACK_MODEL });
  } catch (err) {
    const detail = err instanceof LLMError ? err.message : String(err);
    throw new LLMError(
      "api_error",
      "groq",
      `Both Groq models failed. ` +
        `"${PRIMARY_MODEL}" was rate-limited; "${FALLBACK_MODEL}" error: ${detail}`
    );
  }
}


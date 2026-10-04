/**
 * Unified, fetch-based LLM client for all OpenAI-compatible providers.
 *
 * Uses plain fetch() — NOT the openai npm SDK or any native addon.
 * WebContainers disable native Node addons (ERR_DLOPEN_DISABLED); fetch
 * is available everywhere and is the safe baseline here.
 *
 * The client is intentionally provider-agnostic: all provider-specific
 * config (base URL, API key, extra headers, default model) lives in
 * providers.ts. callLLM just assembles the request from those values.
 */

import { PROVIDERS, type ProviderName } from "./providers";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  /** For tool-call result messages (role: "tool"). */
  tool_call_id?: string;
  name?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
}

export interface LLMOptions {
  /** Override the provider's defaultModel. */
  model?: string;
  /** Hard cap on completion tokens. Callers are responsible for provider limits. */
  max_tokens?: number;
  temperature?: number;
  /**
   * When true, callLLM returns the raw Response (a ReadableStream body).
   * The caller is responsible for SSE/chunk parsing — nothing is buffered
   * server-side. When false (default), the full JSON response is returned.
   */
  stream?: boolean;
  /** Abort signal passed directly to fetch. */
  signal?: AbortSignal;
  /** Stop sequences forwarded to the provider. */
  stop?: string[];
  /** Tool definitions forwarded as-is (OpenAI tool schema). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[];
  /** Tool-choice forwarded as-is. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool_choice?: any;
}

/** A parsed, full (non-streamed) response from /chat/completions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LLMResponse = Record<string, any>;

/**
 * Typed error thrown by callLLM.
 *  - "rate_limit"  → HTTP 429 from the provider (triggers fallback logic)
 *  - "api_error"   → Any other non-2xx from the provider
 *  - "network"     → fetch threw before we got any HTTP response
 */
export class LLMError extends Error {
  readonly code: "rate_limit" | "api_error" | "network";
  readonly provider: ProviderName;
  /** Seconds to wait before retrying, if the provider stated one. */
  readonly retryAfter: number | null;

  constructor(
    code: LLMError["code"],
    provider: ProviderName,
    message: string,
    retryAfter: number | null = null
  ) {
    super(message);
    this.name = "LLMError";
    this.code = code;
    this.provider = provider;
    this.retryAfter = retryAfter;
  }
}

// ---------------------------------------------------------------------------
// Core client
// ---------------------------------------------------------------------------

/**
 * Makes a single POST /chat/completions call to the specified provider.
 *
 * @param provider - Which provider entry from PROVIDERS to use.
 * @param messages - Conversation messages (OpenAI format).
 * @param options  - Optional overrides (model, max_tokens, stream, …).
 *
 * @returns
 *   - If stream=false (default): resolves to the parsed JSON response object.
 *   - If stream=true: resolves to the raw Response so the caller can
 *     consume the body stream directly.
 *
 * @throws LLMError on 429 (rate_limit), other non-2xx (api_error), or
 *   fetch failure before any HTTP response (network).
 */
export async function callLLM(
  provider: ProviderName,
  messages: LLMMessage[],
  options: LLMOptions & { stream: true }
): Promise<Response>;
export async function callLLM(
  provider: ProviderName,
  messages: LLMMessage[],
  options?: LLMOptions & { stream?: false }
): Promise<LLMResponse>;
export async function callLLM(
  provider: ProviderName,
  messages: LLMMessage[],
  options: LLMOptions = {}
): Promise<LLMResponse | Response> {
  const config = PROVIDERS[provider];

  if (!config.apiKey) {
    throw new LLMError(
      "api_error",
      provider,
      `API key for provider "${provider}" is not configured in the environment.`
    );
  }

  const model = options.model ?? config.defaultModel;
  const stream = options.stream ?? false;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream,
  };
  if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.stop !== undefined) body.stop = options.stop;
  if (options.tools !== undefined) body.tools = options.tools;
  if (options.tool_choice !== undefined) body.tool_choice = options.tool_choice;

  let response: Response;
  try {
    response = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...config.defaultHeaders,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    // fetch itself threw — network-level failure (no HTTP status to inspect).
    const message = err instanceof Error ? err.message : String(err);
    throw new LLMError("network", provider, `Network error calling ${provider}: ${message}`);
  }

  if (!response.ok) {
    if (response.status === 429) {
      // Parse retry-after header (seconds integer or HTTP-date).
      const retryHeader = response.headers.get("retry-after");
      const retryAfter = retryHeader !== null && /^\d+$/.test(retryHeader.trim())
        ? parseInt(retryHeader.trim(), 10)
        : null;
      // Best-effort body read for the error message — don't throw if it fails.
      const bodyText = await response.text().catch(() => "");
      let message = `Rate limited by ${provider}`;
      try {
        const parsed = JSON.parse(bodyText);
        if (parsed?.error?.message) message = parsed.error.message;
      } catch {
        if (bodyText) message = bodyText.slice(0, 300);
      }
      throw new LLMError("rate_limit", provider, message, retryAfter);
    }

    const bodyText = await response.text().catch(() => "");
    let message = `${provider} API error ${response.status}`;
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed?.error?.message) message = `${provider}: ${parsed.error.message}`;
    } catch {
      if (bodyText) message = `${provider}: ${bodyText.slice(0, 500)}`;
    }
    throw new LLMError("api_error", provider, message);
  }

  // Stream mode: hand the raw Response to the caller — they control the body.
  if (stream) return response;

  // Non-stream mode: parse and return the full JSON payload.
  return response.json() as Promise<LLMResponse>;
}

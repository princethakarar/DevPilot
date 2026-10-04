/**
 * Provider configuration map for all LLM providers used in DevPilot.
 *
 * Each entry describes how to reach a provider's OpenAI-compatible
 * /chat/completions endpoint. All three providers share the same wire
 * format (POST, JSON, Authorization: Bearer), so a single fetch-based
 * client (client.ts) can serve all of them.
 *
 * Provider-specific quirks (e.g. OpenRouter's required extra headers) live
 * HERE in the config, not inside callLLM, so the client stays generic.
 */

export type ProviderName = "openrouter" | "groq";

export interface ProviderConfig {
  baseURL: string;
  /** Resolved from process.env at module load time. Undefined → key not set. */
  apiKey: string | undefined;
  /** Additional HTTP headers required by this provider (merged into every request). */
  defaultHeaders: Record<string, string>;
  /** Canonical model to use when the caller does not override. */
  defaultModel: string;
}

// Evaluated once at module load so process.env reads happen server-side.
export const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
      // OpenRouter requires these two headers on every request. Docs:
      // https://openrouter.ai/docs#requests
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://devpilot.app",
      "X-Title": "DevPilot",
    },
    defaultModel: "openai/gpt-oss-120b:free",

  },

  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY,
    defaultHeaders: {},
    defaultModel: "openai/gpt-oss-120b",
  },
};

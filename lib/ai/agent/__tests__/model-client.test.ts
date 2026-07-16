import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callAgentModel, AgentModelError, AgentRateLimitError } from "../model-client";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

describe("callAgentModel — rate limit error classification", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("classifies a 429 with a concrete wait time as 'rate_limited' and parses the seconds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(429, {
          error: { message: "Rate limit reached for model. Please try again in 10.65s." },
        })
      )
    );

    await expect(callAgentModel([{ role: "user", content: "hi" }])).rejects.toMatchObject({
      kind: "rate_limited",
      waitSeconds: 10.65,
    });
  });

  it("classifies a 413 'request too large' as 'too_large', distinct from a time-based rate limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(413, {
          error: {
            message:
              "Request too large for model `qwen/qwen3-32b` ... tokens per minute (TPM): Limit 6000, Requested 14274, please reduce your message size and try again.",
          },
        })
      )
    );

    const err = await callAgentModel([{ role: "user", content: "hi" }]).catch((e) => e);
    expect(err).toBeInstanceOf(AgentRateLimitError);
    expect(err.kind).toBe("too_large");
  });

  it("falls back to the retry-after header when the message has no parseable wait time", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(429, { error: { message: "Rate limited." } }, { "retry-after": "7" }))
    );

    const err = await callAgentModel([{ role: "user", content: "hi" }]).catch((e) => e);
    expect(err.waitSeconds).toBe(7);
  });

  it("AgentRateLimitError is also an AgentModelError (existing generic catch sites keep working)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(429, { error: { message: "Please try again in 1s." } })));
    const err = await callAgentModel([{ role: "user", content: "hi" }]).catch((e) => e);
    expect(err).toBeInstanceOf(AgentModelError);
  });

  it("a non-rate-limit error status still throws the plain AgentModelError, not the rate-limit subclass", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "Internal error" } })));
    const err = await callAgentModel([{ role: "user", content: "hi" }]).catch((e) => e);
    expect(err).toBeInstanceOf(AgentModelError);
    expect(err).not.toBeInstanceOf(AgentRateLimitError);
  });

  it("a successful response passes through normally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          choices: [{ message: { role: "assistant", content: "done", tool_calls: [] } }],
          usage: { total_tokens: 123 },
        })
      )
    );
    const result = await callAgentModel([{ role: "user", content: "hi" }]);
    expect(result.approxTokens).toBe(123);
    expect(result.toolCalls).toEqual([]);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callAgentModel,
  resolvePrimaryModel,
  resolveFallbackModel,
  AgentModelError,
  AgentModelUnavailableError,
  AgentRateLimitError,
  AgentToolCallGenerationError,
} from "../model-client";
import { reserveEstimate, releaseReservation, __resetTokenBudgetForTests } from "../token-budget";

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
    __resetTokenBudgetForTests();
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

  it("classifies Groq's 'failed to call a function' 400 as AgentToolCallGenerationError, capturing failed_generation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          error: {
            message: "Failed to call a function. Please adjust your prompt. See 'failed_generation' for more details.",
            failed_generation: "{\"name\": \"write_file\", \"arguments\": \"{ malformed",
            code: "tool_use_failed",
          },
        })
      )
    );

    const err = await callAgentModel([{ role: "user", content: "hi" }]).catch((e) => e);
    expect(err).toBeInstanceOf(AgentToolCallGenerationError);
    expect(err).not.toBeInstanceOf(AgentRateLimitError);
    expect((err as AgentToolCallGenerationError).failedGeneration).toMatch(/malformed/);
  });

  it("a 400 unrelated to tool-call generation still throws the plain AgentModelError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, { error: { message: "Invalid request body" } })));
    const err = await callAgentModel([{ role: "user", content: "hi" }]).catch((e) => e);
    expect(err).toBeInstanceOf(AgentModelError);
    expect(err).not.toBeInstanceOf(AgentToolCallGenerationError);
  });

  it("classifies a 404 as AgentModelUnavailableError, naming the misconfigured model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(404, { error: { message: "The model does not exist.", code: "model_not_found" } }))
    );
    const err = await callAgentModel([{ role: "user", content: "hi" }], undefined, undefined, "some/removed-model").catch((e) => e);
    expect(err).toBeInstanceOf(AgentModelUnavailableError);
    expect(err).toBeInstanceOf(AgentModelError);
    expect(err.message).toMatch(/some\/removed-model/);
  });

  it("classifies a 400 'no such model' message as AgentModelUnavailableError even without a 404 status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(400, { error: { message: "Error code: 400 - no such model" } })));
    const err = await callAgentModel([{ role: "user", content: "hi" }]).catch((e) => e);
    expect(err).toBeInstanceOf(AgentModelUnavailableError);
  });

  it("uses the explicit model argument over the env-resolved default when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { choices: [{ message: { role: "assistant", content: "ok", tool_calls: [] } }], usage: { total_tokens: 5 } })
    );
    vi.stubGlobal("fetch", fetchMock);
    await callAgentModel([{ role: "user", content: "hi" }], undefined, undefined, "explicit-model-override");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("explicit-model-override");
  });

  it("resolvePrimaryModel and resolveFallbackModel read their respective env overrides, and default to two distinct models", () => {
    delete process.env.AGENT_GROQ_MODEL;
    delete process.env.AGENT_GROQ_FALLBACK_MODEL;
    expect(resolvePrimaryModel()).not.toBe(resolveFallbackModel());

    process.env.AGENT_GROQ_MODEL = "custom-primary";
    process.env.AGENT_GROQ_FALLBACK_MODEL = "custom-fallback";
    expect(resolvePrimaryModel()).toBe("custom-primary");
    expect(resolveFallbackModel()).toBe("custom-fallback");
    delete process.env.AGENT_GROQ_MODEL;
    delete process.env.AGENT_GROQ_FALLBACK_MODEL;
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

  it("paces the request when the global token budget is already full, reporting the wait via onStatus, then proceeds once it frees up", async () => {
    vi.useFakeTimers();
    const reservationId = reserveEstimate(5000); // fills the ~4800-token safety budget on its own
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          choices: [{ message: { role: "assistant", content: "done", tool_calls: [] } }],
          usage: { total_tokens: 50 },
        })
      )
    );
    const statusMessages: string[] = [];
    const callPromise = callAgentModel([{ role: "user", content: "hi" }], (m) => {
      statusMessages.push(m);
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(statusMessages.some((m) => m.includes("Pacing request"))).toBe(true);

    releaseReservation(reservationId);
    await vi.advanceTimersByTimeAsync(2100); // past the pacer's poll interval, so it re-checks and proceeds

    const result = await callPromise;
    expect(result.approxTokens).toBe(50);
    vi.useRealTimers();
  });
});

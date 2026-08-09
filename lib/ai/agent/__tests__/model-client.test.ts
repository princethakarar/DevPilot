import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  callAgentModel,
  parseWaitSeconds,
  resolvePrimaryModel,
  resolveFallbackModel,
  AgentModelError,
  AgentModelUnavailableError,
  AgentRateLimitError,
  AgentResponseTruncatedError,
  AgentToolCallGenerationError,
} from "../model-client";
import {
  reserveEstimate,
  releaseReservation,
  ledgerUsageForModel,
  estimateBilledTokens,
  MAX_COMPLETION_TOKENS,
  __resetTokenBudgetForTests,
} from "../token-budget";
import type { AgentModelMessage } from "../model-client";
import { limitsForModel, __resetObservedLimitsForTests } from "../model-limits";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

// Top level, not per-describe: the token ledger is module-level state shared
// by every call in the file. Left un-reset, reservations accumulate across
// tests until the pacer legitimately blocks the next call for its full 75s
// wait, which surfaces as an unrelated-looking test timeout.
beforeEach(() => {
  process.env.GROQ_API_KEY = "test-key";
  __resetTokenBudgetForTests();
  __resetObservedLimitsForTests();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callAgentModel — rate limit error classification", () => {
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
    // The primary model's real ceiling is 12,000 TPM -> a 9,600 safety budget,
    // so filling it takes more than the old single-6000-limit assumption did.
    const reservation = reserveEstimate(9500, resolvePrimaryModel());
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

    releaseReservation(reservation);
    await vi.advanceTimersByTimeAsync(2100); // past the pacer's poll interval, so it re-checks and proceeds

    const result = await callPromise;
    expect(result.approxTokens).toBe(50);
    vi.useRealTimers();
  });
});

describe("wait-time parsing", () => {
  it("parses the seconds-only form Groq uses for per-minute limits", () => {
    expect(parseWaitSeconds("Please try again in 13.68s.")).toBeCloseTo(13.68);
  });

  it("parses the minute-formatted form Groq uses for daily limits (previously fell through to a 15s default)", () => {
    expect(parseWaitSeconds("Please try again in 13m40.8s.")).toBeCloseTo(820.8);
    expect(parseWaitSeconds("Please try again in 22m4.512s.")).toBeCloseTo(1324.512);
  });

  it("parses an hours form and a bare minutes form", () => {
    expect(parseWaitSeconds("Please try again in 1h2m3s.")).toBeCloseTo(3723);
    expect(parseWaitSeconds("Please try again in 5m.")).toBeCloseTo(300);
  });

  it("returns null — not 0 — when there is no duration to parse", () => {
    expect(parseWaitSeconds("Rate limited.")).toBeNull();
    expect(parseWaitSeconds("Please try again in a while.")).toBeNull();
  });
});

describe("daily quota (TPD) classification", () => {
  it("classifies a tokens-per-day 429 as 'daily_exhausted', distinct from a per-minute rate limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(429, {
          error: {
            message:
              "Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_x` service tier `on_demand` on tokens per day (TPD): Limit 100000, Used 99848, Requested 1685. Please try again in 22m4.512s.",
          },
        })
      )
    );

    const err = await callAgentModel([{ role: "user", content: "hi" }]).catch((e) => e);
    expect(err).toBeInstanceOf(AgentRateLimitError);
    expect(err.kind).toBe("daily_exhausted");
    // The whole point: the real wait is ~22 minutes, not the 15s default.
    expect(err.waitSeconds).toBeCloseTo(1324.512);
  });

  it("still classifies a tokens-per-minute 429 as 'rate_limited'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(429, {
          error: { message: "Rate limit reached ... on tokens per minute (TPM): Limit 6000, Used 5657. Please try again in 13.68s." },
        })
      )
    );
    const err = await callAgentModel([{ role: "user", content: "hi" }]).catch((e) => e);
    expect(err.kind).toBe("rate_limited");
  });
});

describe("truncated response detection", () => {
  it("throws AgentResponseTruncatedError when the model hit the completion ceiling mid-reply", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          choices: [{ finish_reason: "length", message: { role: "assistant", content: "half a fi" } }],
          usage: { prompt_tokens: 100, total_tokens: 2600 },
        })
      )
    );
    const err = await callAgentModel([{ role: "user", content: "hi" }]).catch((e) => e);
    expect(err).toBeInstanceOf(AgentResponseTruncatedError);
    expect(err).toBeInstanceOf(AgentModelError);
    expect(err.message).toMatch(new RegExp(String(MAX_COMPLETION_TOKENS)));
  });

  it("still charges the ledger for a truncated reply — the tokens were consumed even though the answer is unusable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          choices: [{ finish_reason: "length", message: { role: "assistant", content: "cut off" } }],
          // A truncated reply ran the completion to the ceiling, so total is
          // deliberately NOT prompt + ceiling here — that would make the
          // assertion pass under either settlement rule and prove nothing.
          usage: { prompt_tokens: 100, completion_tokens: 2500, total_tokens: 3100 },
        })
      )
    );
    await callAgentModel([{ role: "user", content: "hi" }]).catch(() => {});
    expect(ledgerUsageForModel(resolvePrimaryModel())).toBe(3100);
  });

  it("a normal finish_reason passes through untouched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [] } }],
          usage: { prompt_tokens: 100, total_tokens: 120 },
        })
      )
    );
    await expect(callAgentModel([{ role: "user", content: "hi" }])).resolves.toBeTruthy();
  });
});

describe("ledger reservation and settlement", () => {
  it("holds the full admission figure (prompt + ceiling) for as long as the request is in flight", async () => {
    // Groq admits a request on prompt + max_tokens, so that whole amount has
    // to stay on the books until the response lands — otherwise a second
    // concurrent call gets waved into headroom this one still needs.
    let usageDuringFlight = -1;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        usageDuringFlight = ledgerUsageForModel(resolvePrimaryModel());
        return jsonResponse(200, {
          choices: [{ finish_reason: "stop", message: { role: "assistant", content: "ok", tool_calls: [] } }],
          usage: { prompt_tokens: 1547, completion_tokens: 15, total_tokens: 1562 },
        });
      })
    );

    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];
    await callAgentModel(messages);

    expect(usageDuringFlight).toBe(estimateBilledTokens(messages, MAX_COMPLETION_TOKENS));
    // Sanity: the reservation is dominated by the ceiling, not the tiny prompt.
    expect(usageDuringFlight).toBeGreaterThan(MAX_COMPLETION_TOKENS);
  });

  it("settles down to real consumption once the response lands — Groq does not keep the unused ceiling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          choices: [{ finish_reason: "stop", message: { role: "assistant", content: "ok", tool_calls: [] } }],
          usage: { prompt_tokens: 1547, completion_tokens: 15, total_tokens: 1562 },
        })
      )
    );

    const result = await callAgentModel([{ role: "user", content: "hi" }]);
    expect(result.approxTokens).toBe(1562); // cost signal
    expect(ledgerUsageForModel(resolvePrimaryModel())).toBe(1562); // settled window usage
  });

  it("releases the reservation entirely when the request was rejected and never billed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "boom" } })));
    await callAgentModel([{ role: "user", content: "hi" }]).catch(() => {});
    expect(ledgerUsageForModel(resolvePrimaryModel())).toBe(0);
  });
});

describe("observed rate limits", () => {
  it("overrides the bootstrap TPM constant with what the provider reports", async () => {
    expect(limitsForModel("llama-3.1-8b-instant").tpm).toBe(6000); // bootstrap
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          200,
          {
            choices: [{ finish_reason: "stop", message: { role: "assistant", content: "ok", tool_calls: [] } }],
            usage: { prompt_tokens: 10, total_tokens: 12 },
          },
          { "x-ratelimit-limit-tokens": "30000" }
        )
      )
    );

    await callAgentModel([{ role: "user", content: "hi" }], undefined, undefined, "llama-3.1-8b-instant");
    expect(limitsForModel("llama-3.1-8b-instant").tpm).toBe(30000);
  });

  it("learns the real limit from an ERROR response too, not just a success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(429, { error: { message: "Rate limit reached. Please try again in 1s." } }, { "x-ratelimit-limit-tokens": "9000" })
      )
    );
    await callAgentModel([{ role: "user", content: "hi" }], undefined, undefined, "some-model").catch(() => {});
    expect(limitsForModel("some-model").tpm).toBe(9000);
  });

  it("leaves the previous value alone when the header is absent or unparseable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          choices: [{ finish_reason: "stop", message: { role: "assistant", content: "ok", tool_calls: [] } }],
          usage: { prompt_tokens: 10, total_tokens: 12 },
        })
      )
    );
    await callAgentModel([{ role: "user", content: "hi" }], undefined, undefined, "llama-3.3-70b-versatile");
    expect(limitsForModel("llama-3.3-70b-versatile").tpm).toBe(12000);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callModelWithRateLimitHandling, createModelFallbackState, MAX_RATE_LIMIT_RETRIES, MAX_TOOL_CALL_GEN_RETRIES } from "../rate-limit-retry";
import { AgentModelUnavailableError, type AgentModelMessage } from "../model-client";

const PRIMARY_MODEL = "llama-3.3-70b-versatile"; // model-client.ts's DEFAULT_AGENT_MODEL
const FALLBACK_MODEL = "llama-3.1-8b-instant"; // model-client.ts's DEFAULT_FALLBACK_AGENT_MODEL

/** Pins AGENT_GROQ_FALLBACK_MODEL to the same value as the primary, so canFallBack is false and these tests exercise pure single-model exhaustion. */
function disableFallback() {
  process.env.AGENT_GROQ_FALLBACK_MODEL = PRIMARY_MODEL;
}

function modelOf(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): string {
  return JSON.parse(fetchMock.mock.calls[callIndex][1].body).model;
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

const RATE_LIMITED_BODY = { error: { message: "Rate limit reached. Please try again in 0.01s." } };
const TOO_LARGE_BODY = { error: { message: "Request too large ... please reduce your message size and try again." } };
const TOOL_CALL_GEN_FAILURE_BODY = {
  error: {
    message: "Failed to call a function. Please adjust your prompt.",
    code: "tool_use_failed",
    failed_generation: "{\"name\": \"write_file\", \"arguments\": \"{ malformed",
  },
};
const SUCCESS_BODY = { choices: [{ message: { role: "assistant", content: "ok", tool_calls: [] } }], usage: { total_tokens: 10 } };

const noSleep = () => Promise.resolve();

beforeEach(() => {
  process.env.GROQ_API_KEY = "test-key";
  delete process.env.AGENT_GROQ_MODEL;
  delete process.env.AGENT_GROQ_FALLBACK_MODEL;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AGENT_GROQ_MODEL;
  delete process.env.AGENT_GROQ_FALLBACK_MODEL;
});

describe("callModelWithRateLimitHandling", () => {
  it("retries after a rate-limited (429) error and succeeds once the limit clears", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, RATE_LIMITED_BODY))
      .mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const statusMessages: string[] = [];
    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];

    const outcome = await callModelWithRateLimitHandling(
      messages,
      (m) => {
        statusMessages.push(m);
      },
      noSleep
    );

    expect(outcome.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(statusMessages[0]).toMatch(/Rate limited by the AI provider — retrying in/);
  });

  it("on a 'too large' error, trims the messages array before retrying — not just waits and resends unchanged", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(413, TOO_LARGE_BODY))
      .mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const bigToolResult = JSON.stringify({ path: "src/big.ts", content: "x".repeat(500) });
    const messages: AgentModelMessage[] = [
      { role: "user", content: "hi" },
      { role: "tool", tool_call_id: "1", name: "read_file", content: bigToolResult },
    ];

    const outcome = await callModelWithRateLimitHandling(messages, () => {}, noSleep);

    expect(outcome.ok).toBe(true);
    // The retried request must NOT be byte-for-byte identical to the failed one.
    const firstCallBody = fetchMock.mock.calls[0][1].body;
    const secondCallBody = fetchMock.mock.calls[1][1].body;
    expect(secondCallBody).not.toBe(firstCallBody);
    expect(messages[1].content).toMatch(/^\[Previously read:/);
  });

  it("gives up cleanly after MAX_RATE_LIMIT_RETRIES with a clear, actionable reason — never throws", async () => {
    disableFallback();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, RATE_LIMITED_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];
    const outcome = await callModelWithRateLimitHandling(messages, () => {}, noSleep);

    expect(outcome).toEqual({
      ok: false,
      reason: "Task paused — AI provider rate limit exceeded. Try again in a minute, or reduce task scope.",
    });
    // Initial attempt + MAX_RATE_LIMIT_RETRIES retries.
    expect(fetchMock).toHaveBeenCalledTimes(MAX_RATE_LIMIT_RETRIES + 1);
  });

  it("propagates a non-rate-limit error immediately, without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: "boom" } }));
    vi.stubGlobal("fetch", fetchMock);

    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];
    await expect(callModelWithRateLimitHandling(messages, () => {}, noSleep)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries after a tool-call generation failure (Groq 'failed to call a function') and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(400, TOOL_CALL_GEN_FAILURE_BODY))
      .mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const statusMessages: string[] = [];
    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];

    const outcome = await callModelWithRateLimitHandling(
      messages,
      (m) => {
        statusMessages.push(m);
      },
      noSleep
    );

    expect(outcome.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(statusMessages[0]).toMatch(/invalid tool call — retrying/);
  });

  it("gives up cleanly after MAX_TOOL_CALL_GEN_RETRIES of repeated tool-call generation failures", async () => {
    disableFallback();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, TOOL_CALL_GEN_FAILURE_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];
    const outcome = await callModelWithRateLimitHandling(messages, () => {}, noSleep);

    expect(outcome).toEqual({
      ok: false,
      reason:
        "The AI model repeatedly failed to generate a valid tool call for this step. Try rephrasing the task or breaking it into smaller steps.",
      failedGeneration: TOOL_CALL_GEN_FAILURE_BODY.error.failed_generation,
    });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_TOOL_CALL_GEN_RETRIES + 1);
  });

  it("stops cleanly once the stop signal is aborted mid-backoff, without exhausting all retries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, RATE_LIMITED_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];

    const outcome = await callModelWithRateLimitHandling(
      messages,
      () => {
        // Simulate the user clicking Stop right as the first retry's status lands.
        controller.abort();
      },
      noSleep,
      controller.signal
    );

    expect(outcome).toEqual({ ok: false, reason: "Stopped by user request." });
    // Only the initial attempt fired — the abort during backoff pre-empted any retry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("automatic model fallback", () => {
  it("switches to the fallback model immediately on a model-unavailable (404) error, without retrying the primary", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(404, { error: { message: "The model does not exist.", code: "model_not_found" } }))
      .mockResolvedValueOnce(jsonResponse(200, SUCCESS_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const statusMessages: string[] = [];
    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];
    const outcome = await callModelWithRateLimitHandling(messages, (m) => void statusMessages.push(m), noSleep);

    expect(outcome.ok).toBe(true);
    // No retry against the now-missing primary — one failed call, one fallback call.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(modelOf(fetchMock, 0)).toBe(PRIMARY_MODEL);
    expect(modelOf(fetchMock, 1)).toBe(FALLBACK_MODEL);
    expect(statusMessages[0]).toMatch(/Configured model unavailable.*switching from.*to fallback model/);
  });

  it("switches to the fallback model after exhausting rate-limit retries on the primary, then succeeds there", async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      calls += 1;
      return calls <= MAX_RATE_LIMIT_RETRIES + 1 ? jsonResponse(429, RATE_LIMITED_BODY) : jsonResponse(200, SUCCESS_BODY);
    });
    vi.stubGlobal("fetch", fetchMock);

    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];
    const outcome = await callModelWithRateLimitHandling(messages, () => {}, noSleep);

    expect(outcome.ok).toBe(true);
    // MAX_RATE_LIMIT_RETRIES+1 attempts on the primary, then one success on the fallback.
    for (let i = 0; i <= MAX_RATE_LIMIT_RETRIES; i++) expect(modelOf(fetchMock, i)).toBe(PRIMARY_MODEL);
    expect(modelOf(fetchMock, MAX_RATE_LIMIT_RETRIES + 1)).toBe(FALLBACK_MODEL);
  });

  it("switches to the fallback model after exhausting tool-call-generation retries on the primary, then succeeds there", async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      calls += 1;
      return calls <= MAX_TOOL_CALL_GEN_RETRIES + 1 ? jsonResponse(400, TOOL_CALL_GEN_FAILURE_BODY) : jsonResponse(200, SUCCESS_BODY);
    });
    vi.stubGlobal("fetch", fetchMock);

    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];
    const outcome = await callModelWithRateLimitHandling(messages, () => {}, noSleep);

    expect(outcome.ok).toBe(true);
    for (let i = 0; i <= MAX_TOOL_CALL_GEN_RETRIES; i++) expect(modelOf(fetchMock, i)).toBe(PRIMARY_MODEL);
    expect(modelOf(fetchMock, MAX_TOOL_CALL_GEN_RETRIES + 1)).toBe(FALLBACK_MODEL);
  });

  it("gives up with a combined failure once BOTH the primary and the fallback are unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { error: { message: "The model does not exist.", code: "model_not_found" } }));
    vi.stubGlobal("fetch", fetchMock);

    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];
    const err = await callModelWithRateLimitHandling(messages, () => {}, noSleep).catch((e) => e);

    expect(err).toBeInstanceOf(AgentModelUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one attempt each, no pointless retries on either
    expect(modelOf(fetchMock, 0)).toBe(PRIMARY_MODEL);
    expect(modelOf(fetchMock, 1)).toBe(FALLBACK_MODEL);
  });

  it("only ever switches once — a fallbackState already on fallback exhausts its own retries without switching again", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, RATE_LIMITED_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const alreadyOnFallback = { usingFallback: true };
    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];
    const outcome = await callModelWithRateLimitHandling(messages, () => {}, noSleep, undefined, alreadyOnFallback);

    expect(outcome).toEqual({
      ok: false,
      reason: "Task paused — AI provider rate limit exceeded. Try again in a minute, or reduce task scope.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_RATE_LIMIT_RETRIES + 1);
  });

  it("createModelFallbackState starts a run on the primary model", () => {
    expect(createModelFallbackState()).toEqual({ usingFallback: false });
  });

  it("a fallbackState shared across two calls stays on the fallback for the second call once the first one switched", async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? jsonResponse(404, { error: { code: "model_not_found", message: "gone" } }) : jsonResponse(200, SUCCESS_BODY);
    });
    vi.stubGlobal("fetch", fetchMock);

    const fallbackState = createModelFallbackState();
    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];

    await callModelWithRateLimitHandling(messages, () => {}, noSleep, undefined, fallbackState);
    expect(fallbackState.usingFallback).toBe(true);

    await callModelWithRateLimitHandling(messages, () => {}, noSleep, undefined, fallbackState);
    // Second run's very first (and only) call already goes straight to the fallback.
    expect(modelOf(fetchMock, 2)).toBe(FALLBACK_MODEL);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

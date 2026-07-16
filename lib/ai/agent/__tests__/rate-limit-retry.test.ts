import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callModelWithRateLimitHandling, MAX_RATE_LIMIT_RETRIES } from "../rate-limit-retry";
import type { AgentModelMessage } from "../model-client";

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
const SUCCESS_BODY = { choices: [{ message: { role: "assistant", content: "ok", tool_calls: [] } }], usage: { total_tokens: 10 } };

const noSleep = () => Promise.resolve();

beforeEach(() => {
  process.env.GROQ_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
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
});

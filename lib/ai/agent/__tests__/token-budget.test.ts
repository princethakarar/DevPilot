import { describe, it, expect, beforeEach } from "vitest";
import {
  reserveEstimate,
  reconcileReservation,
  releaseReservation,
  waitForTokenBudget,
  estimatePromptTokens,
  estimateBilledTokens,
  exceedsSafeBudget,
  ledgerUsageForModel,
  MAX_COMPLETION_TOKENS,
  __resetTokenBudgetForTests,
} from "../token-budget";
import { __resetObservedLimitsForTests } from "../model-limits";
import type { AgentModelMessage } from "../model-client";

const noSleep = () => Promise.resolve();

// 6,000 TPM -> a 4,800 safety budget, which is what the reservation sizes below assume.
const SMALL_MODEL = "llama-3.1-8b-instant";
// 12,000 TPM -> a 9,600 safety budget.
const BIG_MODEL = "llama-3.3-70b-versatile";

beforeEach(() => {
  __resetTokenBudgetForTests();
  __resetObservedLimitsForTests();
});

describe("token-budget estimators", () => {
  it("estimatePromptTokens grows with message content and includes a fixed tool-schema overhead", () => {
    const small: AgentModelMessage[] = [{ role: "user", content: "hi" }];
    const bigger: AgentModelMessage[] = [{ role: "user", content: "x".repeat(4000) }];
    expect(estimatePromptTokens(bigger)).toBeGreaterThan(estimatePromptTokens(small));
    expect(estimatePromptTokens(small)).toBeGreaterThan(0);
  });

  it("estimateBilledTokens adds the reserved completion ceiling, because Groq bills prompt + max_tokens up front", () => {
    const messages: AgentModelMessage[] = [{ role: "user", content: "hi" }];
    expect(estimateBilledTokens(messages)).toBe(estimatePromptTokens(messages) + MAX_COMPLETION_TOKENS);
  });

  it("exceedsSafeBudget is model-aware — the same request can fit the primary's window and not the fallback's", () => {
    // ~3,000 prompt tokens + a 2,500 reservation = ~5,500: under the primary's
    // 9,600 safety budget, over the fallback's 4,800.
    const messages: AgentModelMessage[] = [{ role: "user", content: "x".repeat(10_000) }];
    expect(exceedsSafeBudget(messages, BIG_MODEL)).toBe(false);
    expect(exceedsSafeBudget(messages, SMALL_MODEL)).toBe(true);
  });
});

describe("token-budget ledger", () => {
  it("does not wait when the estimate comfortably fits under budget", async () => {
    let waited = false;
    await waitForTokenBudget(100, SMALL_MODEL, () => {
      waited = true;
    }, noSleep);
    expect(waited).toBe(false);
  });

  it("waits when a prior reservation already fills most of the budget, then proceeds once released", async () => {
    const reservation = reserveEstimate(5000, SMALL_MODEL); // over the 4,800 safety budget on its own
    let waitCalls = 0;
    // Release on the first wait tick so the loop can succeed on its next check.
    await waitForTokenBudget(
      1000,
      SMALL_MODEL,
      () => {
        waitCalls += 1;
        releaseReservation(reservation);
      },
      noSleep
    );
    expect(waitCalls).toBeGreaterThan(0);
  });

  it("reconcileReservation replaces the estimate with the real billed amount for future budget checks", async () => {
    const reservation = reserveEstimate(5000, SMALL_MODEL);
    reconcileReservation(reservation, 100);
    expect(ledgerUsageForModel(SMALL_MODEL)).toBe(100);

    let waited = false;
    await waitForTokenBudget(
      1000,
      SMALL_MODEL,
      () => {
        waited = true;
      },
      noSleep
    );
    // 100 (reconciled) + 1000 (next estimate) is well under budget — no wait needed.
    expect(waited).toBe(false);
  });

  it("releaseReservation removes a failed call's estimate entirely so it doesn't count against later budget checks", async () => {
    const reservation = reserveEstimate(5000, SMALL_MODEL);
    releaseReservation(reservation);
    expect(ledgerUsageForModel(SMALL_MODEL)).toBe(0);

    let waited = false;
    await waitForTokenBudget(
      1000,
      SMALL_MODEL,
      () => {
        waited = true;
      },
      noSleep
    );
    expect(waited).toBe(false);
  });

  it("keeps each model's window separate — a fallback-model call must not consume the primary's budget", async () => {
    reserveEstimate(5000, SMALL_MODEL);
    expect(ledgerUsageForModel(SMALL_MODEL)).toBe(5000);
    expect(ledgerUsageForModel(BIG_MODEL)).toBe(0);

    let waitedOnBigModel = false;
    await waitForTokenBudget(
      1000,
      BIG_MODEL,
      () => {
        waitedOnBigModel = true;
      },
      noSleep
    );
    expect(waitedOnBigModel).toBe(false);
  });

  it("uses each model's own ceiling — an identical reservation blocks the 6k model but not the 12k one", async () => {
    reserveEstimate(5000, SMALL_MODEL);
    reserveEstimate(5000, BIG_MODEL);

    let smallWaited = false;
    await waitForTokenBudget(1000, SMALL_MODEL, () => {
      smallWaited = true;
    }, noSleep, () => true); // shouldStop short-circuits so the test doesn't poll to the cap
    // 5000 already exceeds the 4,800 safety budget, so it would have waited.
    expect(ledgerUsageForModel(SMALL_MODEL)).toBe(5000);

    let bigWaited = false;
    await waitForTokenBudget(1000, BIG_MODEL, () => {
      bigWaited = true;
    }, noSleep);
    // 5000 + 1000 = 6000, under the 12k model's 9,600 safety budget.
    expect(bigWaited).toBe(false);
    expect(smallWaited).toBe(false); // never ticked: shouldStop returned first
  });

  it("returns immediately once shouldStop() is true, even while the budget is still full", async () => {
    reserveEstimate(5000, SMALL_MODEL);
    let waitCalls = 0;
    await waitForTokenBudget(
      1000,
      SMALL_MODEL,
      () => {
        waitCalls += 1;
      },
      noSleep,
      () => true
    );
    expect(waitCalls).toBe(0);
  });
});

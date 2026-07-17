import { describe, it, expect, beforeEach } from "vitest";
import {
  reserveEstimate,
  finalizeReservation,
  releaseReservation,
  waitForTokenBudget,
  estimateRequestTokens,
  __resetTokenBudgetForTests,
} from "../token-budget";
import type { AgentModelMessage } from "../model-client";

const noSleep = () => Promise.resolve();

beforeEach(() => {
  __resetTokenBudgetForTests();
});

describe("token-budget ledger", () => {
  it("estimateRequestTokens grows with message content and includes a fixed tool-schema overhead", () => {
    const small: AgentModelMessage[] = [{ role: "user", content: "hi" }];
    const bigger: AgentModelMessage[] = [{ role: "user", content: "x".repeat(4000) }];
    expect(estimateRequestTokens(bigger)).toBeGreaterThan(estimateRequestTokens(small));
    expect(estimateRequestTokens(small)).toBeGreaterThan(0);
  });

  it("does not wait when the estimate comfortably fits under budget", async () => {
    let waited = false;
    await waitForTokenBudget(100, () => {
      waited = true;
    }, noSleep);
    expect(waited).toBe(false);
  });

  it("waits when a prior reservation already fills most of the budget, then proceeds once released", async () => {
    const id = reserveEstimate(5000); // near the ~4800 (6000 * 0.8) safety budget
    let waitCalls = 0;
    // Release the reservation on the first wait tick so the loop can succeed on its next check.
    await waitForTokenBudget(
      1000,
      () => {
        waitCalls += 1;
        releaseReservation(id);
      },
      noSleep
    );
    expect(waitCalls).toBeGreaterThan(0);
  });

  it("finalizeReservation replaces the estimate with real usage for future budget checks", async () => {
    const id = reserveEstimate(5000);
    finalizeReservation(id, 100); // actual usage much lower than the estimate
    let waited = false;
    await waitForTokenBudget(
      1000,
      () => {
        waited = true;
      },
      noSleep
    );
    // 100 (finalized) + 1000 (next estimate) is well under budget — no wait needed.
    expect(waited).toBe(false);
  });

  it("releaseReservation removes a failed call's estimate entirely so it doesn't count against later budget checks", async () => {
    const id = reserveEstimate(5000);
    releaseReservation(id);
    let waited = false;
    await waitForTokenBudget(
      1000,
      () => {
        waited = true;
      },
      noSleep
    );
    expect(waited).toBe(false);
  });
});

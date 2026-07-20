import { describe, it, expect } from "vitest";
import { requestStop, isStopRequested, getStopSignal, clearStop, requestBrowserCommand } from "../relay";

describe("relay stop signal", () => {
  it("requestStop aborts the run's stop signal immediately", () => {
    const runId = `test-run-${Math.random()}`;
    const signal = getStopSignal(runId);
    expect(signal.aborted).toBe(false);

    requestStop(runId);

    expect(signal.aborted).toBe(true);
    expect(isStopRequested(runId)).toBe(true);
    clearStop(runId);
  });

  it("requestStop immediately rejects a run_command call still waiting on the browser, instead of waiting out its timeout", async () => {
    const runId = `test-run-${Math.random()}`;
    const pending = requestBrowserCommand(runId, "npm run build", 240_000);

    requestStop(runId);

    await expect(pending).rejects.toThrow("Stopped by user request.");
    clearStop(runId);
  });

  it("getStopSignal returns a fresh, unaborted signal for a run after clearStop", () => {
    const runId = `test-run-${Math.random()}`;
    requestStop(runId);
    expect(getStopSignal(runId).aborted).toBe(true);

    clearStop(runId);

    expect(getStopSignal(runId).aborted).toBe(false);
    clearStop(runId);
  });
});

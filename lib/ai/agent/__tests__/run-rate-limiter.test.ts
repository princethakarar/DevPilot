import { describe, it, expect, vi, beforeEach } from "vitest";

const findActiveAgentRuns = vi.fn();
const setAgentRunStopRequested = vi.fn();
const countAgentRunsSince = vi.fn();
const requestStop = vi.fn();

vi.mock("@/lib/db/repositories/agentRuns", () => ({
  findActiveAgentRuns: (...args: unknown[]) => findActiveAgentRuns(...args),
  setAgentRunStopRequested: (...args: unknown[]) => setAgentRunStopRequested(...args),
  countAgentRunsSince: (...args: unknown[]) => countAgentRunsSince(...args),
}));
vi.mock("../relay", () => ({
  requestStop: (...args: unknown[]) => requestStop(...args),
}));

const noSleep = () => Promise.resolve();

beforeEach(() => {
  findActiveAgentRuns.mockReset();
  setAgentRunStopRequested.mockReset();
  countAgentRunsSince.mockReset();
  requestStop.mockReset();
});

describe("stopActiveProjectRuns", () => {
  it("returns true immediately when nothing is running for the project — no stop requested", async () => {
    const { stopActiveProjectRuns } = await import("../run-rate-limiter");
    findActiveAgentRuns.mockResolvedValue([]);

    const result = await stopActiveProjectRuns("proj-1", noSleep);

    expect(result).toBe(true);
    expect(requestStop).not.toHaveBeenCalled();
  });

  it("requests a stop on every active run, then returns true once polling confirms none are left running", async () => {
    const { stopActiveProjectRuns } = await import("../run-rate-limiter");
    findActiveAgentRuns
      .mockResolvedValueOnce([{ id: "run-1" }, { id: "run-2" }]) // initial lookup
      .mockResolvedValueOnce([{ id: "run-1" }]) // still finishing
      .mockResolvedValueOnce([]); // both cleared

    const result = await stopActiveProjectRuns("proj-1", noSleep);

    expect(result).toBe(true);
    expect(requestStop).toHaveBeenCalledWith("run-1");
    expect(requestStop).toHaveBeenCalledWith("run-2");
    expect(setAgentRunStopRequested).toHaveBeenCalledTimes(2);
  });

  it("gives up and returns false if a run never actually clears the running state", async () => {
    const { stopActiveProjectRuns } = await import("../run-rate-limiter");
    findActiveAgentRuns.mockResolvedValue([{ id: "stuck-run" }]);

    // A no-op sleep would busy-spin real wall-clock time until the (real)
    // 10s poll deadline passes. Fake timers let this test drive that clock
    // deterministically instead of actually taking 10s.
    vi.useFakeTimers();
    try {
      const sleep = async (ms: number) => {
        await vi.advanceTimersByTimeAsync(ms);
      };
      const resultPromise = stopActiveProjectRuns("proj-1", sleep);
      const result = await resultPromise;
      expect(result).toBe(false);
    } finally {
      vi.useRealTimers();
    }
    expect(requestStop).toHaveBeenCalledWith("stuck-run");
  });
});

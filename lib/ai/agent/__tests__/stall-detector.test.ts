import { describe, it, expect } from "vitest";
import { StallTracker } from "../stall-detector";

describe("StallTracker", () => {
  it("does not flag a stall before 3 consecutive identical failures", () => {
    const tracker = new StallTracker();
    const r1 = tracker.recordFailure("Error: Cannot find module 'foo' at src/index.ts:12:5");
    const r2 = tracker.recordFailure("Error: Cannot find module 'foo' at src/index.ts:12:5");
    expect(r1.stalled).toBe(false);
    expect(r2.stalled).toBe(false);
  });

  it("flags a stall on the 3rd consecutive identical failure signature", () => {
    const tracker = new StallTracker();
    tracker.recordFailure("TypeError: x is not a function at src/add.ts:4:10");
    tracker.recordFailure("TypeError: x is not a function at src/add.ts:4:10");
    const third = tracker.recordFailure("TypeError: x is not a function at src/add.ts:4:10");
    expect(third.stalled).toBe(true);
    expect(third.streak).toBe(3);
  });

  it("resets the streak when the failure signature changes", () => {
    const tracker = new StallTracker();
    tracker.recordFailure("Error: A at src/a.ts:1:1");
    tracker.recordFailure("Error: A at src/a.ts:1:1");
    const changed = tracker.recordFailure("Error: B at src/b.ts:9:9");
    expect(changed.stalled).toBe(false);
    expect(changed.streak).toBe(1);
  });

  it("a success clears the streak", () => {
    const tracker = new StallTracker();
    tracker.recordFailure("Error: A at src/a.ts:1:1");
    tracker.recordFailure("Error: A at src/a.ts:1:1");
    tracker.recordSuccess();
    const afterSuccess = tracker.recordFailure("Error: A at src/a.ts:1:1");
    expect(afterSuccess.streak).toBe(1);
    expect(afterSuccess.stalled).toBe(false);
  });
});

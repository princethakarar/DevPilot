import { describe, it, expect } from "vitest";
import { mapWithConcurrency, formatBytes } from "../dep-cache-debug";

describe("mapWithConcurrency", () => {
  it("preserves input order regardless of completion order", async () => {
    const input = [50, 10, 30, 5, 40, 1];
    const out = await mapWithConcurrency(input, 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    expect(out).toEqual(["0:50", "1:10", "2:30", "3:5", "4:40", "5:1"]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency([...Array(50).keys()], 8, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
    });

    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(1);
  });

  it("handles an empty input without invoking the mapper", async () => {
    let calls = 0;
    const out = await mapWithConcurrency([], 4, async () => void calls++);
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it("treats a limit below 1 as serial rather than hanging", async () => {
    const out = await mapWithConcurrency([1, 2, 3], 0, async (n) => n * 2);
    expect(out).toEqual([2, 4, 6]);
  });

  it("reports batch progress against the true total", async () => {
    const seen: [number, number][] = [];
    await mapWithConcurrency([...Array(10).keys()], 4, async (n) => n, (done, total) =>
      seen.push([done, total])
    );
    // Batches of 4, 4, 2 — the final callback must not overshoot the total.
    expect(seen).toEqual([
      [4, 10],
      [8, 10],
      [10, 10],
    ]);
  });
});

describe("formatBytes", () => {
  it("scales units and keeps small values exact", () => {
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(2048)).toBe("2.0KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0MB");
    expect(formatBytes(279_559_136)).toBe("266.6MB");
  });
});

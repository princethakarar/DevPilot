import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fallbackToNpmInstall } from "../loader";
import { DEFAULT_MAXSOCKETS, OOM_MAXSOCKETS, isOomExit } from "../../boot/npm-flags";

/**
 * Minimal localStorage so the rollout module's per-browser state (bucket id,
 * forced override, sticky downgrade) is exercisable under vitest's node env.
 */
function installLocalStorageShim(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  return store;
}

/**
 * Covers the OOM fallback that makes raising maxsockets off 1 safe.
 *
 * This is a hard requirement, not a nice-to-have: the live install path
 * (useNodeModulesPersistence -> fallbackToNpmInstall) has no retry engine
 * around it, so if the sandbox SIGTERM-kills npm at the higher socket cap and
 * this function doesn't retry serialised, the user just sees a failed install.
 * Asserting the retry HAPPENS — with the right cap, in both the CLI flags and
 * the .npmrc — is the only thing that distinguishes "written" from "works".
 */

interface SpawnCall {
  command: string;
  args: string[];
}

function makeInstance(exitCodes: (number | null)[], outputs: string[] = []) {
  const spawns: SpawnCall[] = [];
  const npmrcWrites: string[] = [];
  let call = 0;

  const instance = {
    fs: {
      async writeFile(path: string, data: string) {
        if (path === "/.npmrc") npmrcWrites.push(data);
      },
    },
    async spawn(command: string, args: string[]) {
      const index = call++;
      spawns.push({ command, args });
      const text = outputs[index] ?? "";

      return {
        output: new ReadableStream<string>({
          start(controller) {
            if (text) controller.enqueue(text);
            controller.close();
          },
        }),
        exit: Promise.resolve(exitCodes[index] ?? 0),
        kill() {},
      };
    },
  };

  return { instance, spawns, npmrcWrites };
}

function socketCapFromFlags(args: string[]): number | null {
  const flag = args.find((a) => a.startsWith("--maxsockets="));
  return flag ? Number(flag.split("=")[1]) : null;
}

function socketCapFromNpmrc(contents: string): number | null {
  const line = contents.split("\n").find((l) => l.startsWith("maxsockets="));
  return line ? Number(line.split("=")[1]) : null;
}

describe("isOomExit", () => {
  it("recognises the sandbox SIGTERM kill by exit code", () => {
    expect(isOomExit(143, "")).toBe(true);
  });

  it("recognises it by output when the exit code is unhelpful", () => {
    expect(isOomExit(1, "npm ERR! Killed")).toBe(true);
    expect(isOomExit(null, "JavaScript heap out of memory")).toBe(true);
  });

  it("does not misclassify ordinary dependency failures as OOM", () => {
    expect(isOomExit(1, "npm ERR! ERESOLVE could not resolve")).toBe(false);
    expect(isOomExit(1, "npm ERR! 404 Not Found")).toBe(false);
  });
});

describe("fallbackToNpmInstall OOM fallback", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = installLocalStorageShim();
    // Opt this browser into the raised cap. Without it every session
    // resolves to OOM_MAXSOCKETS (rollout defaults to 0%), which is the
    // production default but would make the fallback untestable — there'd be
    // nothing to fall back FROM.
    storage.set("devpilot:force-maxsockets", String(DEFAULT_MAXSOCKETS));
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  async function runWithTimers<T>(p: Promise<T>): Promise<T> {
    // The fallback deliberately waits 3s for the sandbox to reclaim memory.
    await vi.advanceTimersByTimeAsync(5_000);
    return p;
  }

  it("retries fully serialised after a SIGTERM/143 kill and succeeds", async () => {
    const { instance, spawns, npmrcWrites } = makeInstance([143, 0]);

    const result = await runWithTimers(
      fallbackToNpmInstall(instance as never, () => {})
    );

    expect(result.ok).toBe(true);
    expect(spawns).toHaveLength(2);

    // First attempt at the raised cap, second fully serialised.
    expect(socketCapFromFlags(spawns[0].args)).toBe(DEFAULT_MAXSOCKETS);
    expect(socketCapFromFlags(spawns[1].args)).toBe(OOM_MAXSOCKETS);

    // The .npmrc must move too — CLI flags alone don't bound npm's internal
    // metadata requests, so a stale npmrc would leave the retry only half
    // serialised and liable to be killed again.
    expect(npmrcWrites).toHaveLength(2);
    expect(socketCapFromNpmrc(npmrcWrites[0])).toBe(DEFAULT_MAXSOCKETS);
    expect(socketCapFromNpmrc(npmrcWrites[1])).toBe(OOM_MAXSOCKETS);
  });

  it("detects the kill from output even when the exit code is a plain 1", async () => {
    const { instance, spawns } = makeInstance([1, 0], ["npm ERR! Killed\n", ""]);

    const result = await runWithTimers(fallbackToNpmInstall(instance as never, () => {}));

    expect(result.ok).toBe(true);
    expect(spawns).toHaveLength(2);
    expect(socketCapFromFlags(spawns[1].args)).toBe(OOM_MAXSOCKETS);
  });

  it("reports failure when even the serialised retry is killed", async () => {
    const { instance, spawns } = makeInstance([143, 143]);

    const result = await runWithTimers(fallbackToNpmInstall(instance as never, () => {}));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — narrows the result union");
    expect(result.error).toContain("after OOM fallback");
    expect(spawns).toHaveLength(2);
  });

  it("does NOT burn a retry on a non-OOM failure", async () => {
    const { instance, spawns } = makeInstance([1], ["npm ERR! ERESOLVE unable to resolve\n"]);

    const result = await runWithTimers(fallbackToNpmInstall(instance as never, () => {}));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable — narrows the result union");
    expect(spawns).toHaveLength(1);
    expect(result.error).toContain("ERESOLVE");
  });

  it("uses the raised cap and does not retry when the first attempt succeeds", async () => {
    const { instance, spawns } = makeInstance([0]);

    const result = await runWithTimers(fallbackToNpmInstall(instance as never, () => {}));

    expect(result.ok).toBe(true);
    expect(spawns).toHaveLength(1);
    expect(socketCapFromFlags(spawns[0].args)).toBe(DEFAULT_MAXSOCKETS);
  });

  it("pins the browser to the serialised cap after an OOM, so the next boot starts there", async () => {
    const firstRun = makeInstance([143, 0]);
    await runWithTimers(fallbackToNpmInstall(firstRun.instance as never, () => {}));

    // The sticky downgrade must outrank the forced override still sitting in
    // storage — otherwise a browser that has already proven it OOMs at the
    // raised cap would keep being handed the raised cap.
    const secondRun = makeInstance([0]);
    await runWithTimers(fallbackToNpmInstall(secondRun.instance as never, () => {}));

    expect(socketCapFromFlags(secondRun.spawns[0].args)).toBe(OOM_MAXSOCKETS);
    expect(secondRun.spawns).toHaveLength(1);
  });
});

describe("maxsockets rollout defaults", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = installLocalStorageShim();
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("defaults to the serialised cap when no rollout percentage is configured", async () => {
    // This is the production default. The raised cap's OOM behaviour has
    // never been observed in a real sandbox, so an unconfigured deployment
    // must behave exactly like the pre-change code did.
    expect(process.env.NEXT_PUBLIC_MAXSOCKETS_ROLLOUT_PCT).toBeUndefined();

    const { instance, spawns, npmrcWrites } = makeInstance([0]);
    await vi.advanceTimersByTimeAsync(5_000);
    await fallbackToNpmInstall(instance as never, () => {});

    expect(socketCapFromFlags(spawns[0].args)).toBe(OOM_MAXSOCKETS);
    expect(socketCapFromNpmrc(npmrcWrites[0])).toBe(OOM_MAXSOCKETS);
  });

  it("honours an explicit forced override", async () => {
    storage.set("devpilot:force-maxsockets", "4");

    const { instance, spawns } = makeInstance([0]);
    await vi.advanceTimersByTimeAsync(5_000);
    await fallbackToNpmInstall(instance as never, () => {});

    expect(socketCapFromFlags(spawns[0].args)).toBe(4);
  });

  it("ignores an out-of-range forced override rather than trusting it", async () => {
    storage.set("devpilot:force-maxsockets", "9999");

    const { instance, spawns } = makeInstance([0]);
    await vi.advanceTimersByTimeAsync(5_000);
    await fallbackToNpmInstall(instance as never, () => {});

    expect(socketCapFromFlags(spawns[0].args)).toBe(OOM_MAXSOCKETS);
  });

  it("surfaces install output through the progress callback", async () => {
    const { instance } = makeInstance([0], ["added 398 packages\n"]);
    const messages: string[] = [];

    await vi.advanceTimersByTimeAsync(5_000);
    await fallbackToNpmInstall(instance as never, (p) => messages.push(p.message));

    expect(messages.some((m) => m.includes("added 398 packages"))).toBe(true);
  });
});

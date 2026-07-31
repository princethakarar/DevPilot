import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHash } from "crypto";

// In-memory stand-in for idb-keyval so the Level 1 store is exercised for
// real (same set/get/del calls, same StoredBundle shape) without needing a
// browser IndexedDB.
const idbStore = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  get: async (k: string) => idbStore.get(k),
  set: async (k: string, v: unknown) => void idbStore.set(k, v),
  del: async (k: string) => void idbStore.delete(k),
  keys: async () => [...idbStore.keys()],
}));

import {
  computeDependencyCacheKey,
  captureAndStoreNodeModules,
  tryRestoreNodeModules,
} from "../node-modules-persistence";

// ---------------------------------------------------------------------------
// A minimal WebContainer fs double.
//
// Only models what the capture/restore path actually touches: readdir with
// withFileTypes, readFile (bytes and utf-8), writeFile, mkdir, and spawn (for
// the .bin regeneration script, which is stubbed to a clean no-op exit).
// ---------------------------------------------------------------------------

interface FakeFs {
  files: Map<string, Uint8Array>;
  dirs: Set<string>;
}

function normalize(p: string): string {
  return p.replace(/^\.?\//, "").replace(/\/+$/, "");
}

function makeInstance(fs: FakeFs) {
  function childrenOf(dir: string): { name: string; isDir: boolean }[] {
    const prefix = dir === "" ? "" : `${dir}/`;
    const seen = new Map<string, boolean>();

    for (const path of fs.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (!rest) continue;
      const slash = rest.indexOf("/");
      if (slash === -1) seen.set(rest, false);
      else seen.set(rest.slice(0, slash), true);
    }
    for (const path of fs.dirs) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (!rest) continue;
      const slash = rest.indexOf("/");
      seen.set(slash === -1 ? rest : rest.slice(0, slash), true);
    }

    return [...seen].map(([name, isDir]) => ({ name, isDir }));
  }

  return {
    fs: {
      async readdir(dir: string, opts?: { withFileTypes?: boolean }) {
        const d = normalize(dir);
        const exists = d === "" || fs.dirs.has(d) || [...fs.files.keys()].some((f) => f.startsWith(`${d}/`));
        if (!exists) throw new Error(`ENOENT: ${dir}`);

        const kids = childrenOf(d);
        if (!opts?.withFileTypes) return kids.map((k) => k.name);
        return kids.map((k) => ({
          name: k.name,
          isDirectory: () => k.isDir,
          isFile: () => !k.isDir,
        }));
      },
      async readFile(path: string, encoding?: string) {
        const data = fs.files.get(normalize(path));
        if (!data) throw new Error(`ENOENT: ${path}`);
        return encoding === "utf-8" || encoding === "utf8"
          ? new TextDecoder().decode(data)
          : data;
      },
      async writeFile(path: string, data: Uint8Array | string) {
        const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
        // Copy: the real VFS takes ownership of the bytes, and the restore
        // path hands it subarray views into a shared buffer.
        fs.files.set(normalize(path), new Uint8Array(bytes));
      },
      async mkdir(path: string, _opts?: { recursive?: boolean }) {
        fs.dirs.add(normalize(path));
      },
      async rm(path: string) {
        fs.files.delete(normalize(path));
      },
    },
    async spawn() {
      return {
        output: new ReadableStream<string>({
          start(controller) {
            controller.enqueue(JSON.stringify({ done: true, regenerated: 0, scanned: 1 }) + "\n");
            controller.close();
          },
        }),
        exit: Promise.resolve(0),
      };
    },
  };
}

function seedTree(fs: FakeFs, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    fs.files.set(normalize(path), new TextEncoder().encode(content));
  }
}

describe("computeDependencyCacheKey", () => {
  it("hashes package.json alone when there is no lockfile", async () => {
    const pkg = '{"name":"x"}';
    const expected = createHash("sha256").update(pkg, "utf8").digest("hex");
    expect(await computeDependencyCacheKey(pkg, null)).toBe(expected);
  });

  it("folds the lockfile in, matching scripts/warm-blob-cache.ts's derivation", async () => {
    const pkg = '{"name":"x"}';
    const lock = '{"lockfileVersion":3}';
    // Duplicated here on purpose: this literal IS the contract between the
    // browser and the warm-cache script. If someone changes the separator in
    // one place, this test fails rather than the cache silently going cold.
    const expected = createHash("sha256")
      .update(`${pkg}\n--devpilot-lock--\n${lock}`, "utf8")
      .digest("hex");
    expect(await computeDependencyCacheKey(pkg, lock)).toBe(expected);
  });

  it("distinguishes trees that differ only in their lockfile", async () => {
    const pkg = '{"dependencies":{"react":"^18.0.0"}}';
    const march = await computeDependencyCacheKey(pkg, '{"react":"18.0.1"}');
    const july = await computeDependencyCacheKey(pkg, '{"react":"18.3.1"}');
    expect(march).not.toBe(july);
  });
});

describe("capture -> restore round trip", () => {
  let source: FakeFs;

  beforeEach(() => {
    idbStore.clear();
    source = { files: new Map(), dirs: new Set() };
  });

  it("restores every file byte-for-byte", async () => {
    const tree: Record<string, string> = {
      "package.json": '{"name":"proj"}',
      "node_modules/.package-lock.json": "{}",
      "node_modules/react/package.json": '{"name":"react","version":"18.2.0"}',
      "node_modules/react/index.js": "module.exports = 1;",
      "node_modules/@scope/pkg/package.json": '{"name":"@scope/pkg"}',
      "node_modules/@scope/pkg/lib/deep/nested.js": "// deep",
    };
    seedTree(source, tree);

    const instance = makeInstance(source) as never;
    const bundle = await captureAndStoreNodeModules(instance, "hash-a", '{"name":"proj"}');
    expect(bundle).not.toBeNull();

    // Restore into a completely fresh filesystem.
    const target: FakeFs = { files: new Map(), dirs: new Set() };
    const restored = await tryRestoreNodeModules(makeInstance(target) as never, "hash-a");
    expect(restored).toBe(true);

    for (const [path, content] of Object.entries(tree)) {
      if (!path.startsWith("node_modules/")) continue;
      const got = target.files.get(normalize(path));
      expect(got, `missing ${path}`).toBeDefined();
      expect(new TextDecoder().decode(got!), `content mismatch at ${path}`).toBe(content);
    }
  });

  it("survives files large enough to straddle decompressor chunk boundaries", async () => {
    // The restore path cuts the decompressed stream at arbitrary offsets that
    // don't align with the decompressor's own chunk sizes. Mixed large and
    // tiny files are what exercise ByteStreamReader's partial-chunk handling.
    const big = "A".repeat(300_000);
    const alsoBig = "B".repeat(150_001);
    const tree: Record<string, string> = {
      "node_modules/.package-lock.json": "{}",
      "node_modules/a/big.js": big,
      "node_modules/a/tiny.js": "x",
      "node_modules/b/also-big.js": alsoBig,
      "node_modules/b/empty.js": "",
      "node_modules/c/last.js": "end",
    };
    seedTree(source, tree);
    source.files.set("package.json", new TextEncoder().encode("{}"));

    const bundle = await captureAndStoreNodeModules(makeInstance(source) as never, "hash-b", "{}");
    expect(bundle).not.toBeNull();

    const target: FakeFs = { files: new Map(), dirs: new Set() };
    expect(await tryRestoreNodeModules(makeInstance(target) as never, "hash-b")).toBe(true);

    expect(new TextDecoder().decode(target.files.get("node_modules/a/big.js")!)).toBe(big);
    expect(new TextDecoder().decode(target.files.get("node_modules/b/also-big.js")!)).toBe(alsoBig);
    expect(new TextDecoder().decode(target.files.get("node_modules/a/tiny.js")!)).toBe("x");
    expect(new TextDecoder().decode(target.files.get("node_modules/c/last.js")!)).toBe("end");
    expect(target.files.get("node_modules/b/empty.js")!.byteLength).toBe(0);
  });

  it("refuses to capture when package.json no longer matches the cache key", async () => {
    seedTree(source, {
      "package.json": '{"name":"proj","dependencies":{"lodash":"^4.0.0"}}',
      "node_modules/.package-lock.json": "{}",
      "node_modules/lodash/index.js": "// added by the user in the terminal",
    });

    // Key was derived at boot from the ORIGINAL package.json; the user has
    // since run `npm install lodash`. Capturing here would publish lodash to
    // every future user of the base template.
    const bundle = await captureAndStoreNodeModules(
      makeInstance(source) as never,
      "hash-c",
      '{"name":"proj"}'
    );

    expect(bundle).toBeNull();
    expect(idbStore.size).toBe(0);
  });

  it("skips a second capture while one is already in flight for the same key", async () => {
    seedTree(source, {
      "package.json": "{}",
      "node_modules/.package-lock.json": "{}",
      "node_modules/a/index.js": "x".repeat(50_000),
      "node_modules/b/index.js": "y".repeat(50_000),
    });
    const instance = makeInstance(source) as never;

    // Both triggered before either resolves — exactly what the fs.watch
    // debounce does when the OOM fallback's retry rewrites node_modules
    // partway through the first capture.
    const [first, second] = await Promise.all([
      captureAndStoreNodeModules(instance, "hash-e", "{}"),
      captureAndStoreNodeModules(instance, "hash-e", "{}"),
    ]);

    const completed = [first, second].filter((b) => b !== null);
    expect(completed).toHaveLength(1);

    // The winner must still be fully usable, not a casualty of the guard.
    const target: FakeFs = { files: new Map(), dirs: new Set() };
    expect(await tryRestoreNodeModules(makeInstance(target) as never, "hash-e")).toBe(true);
    expect(target.files.get("node_modules/a/index.js")!.byteLength).toBe(50_000);
  });

  it("does not capture before npm has settled", async () => {
    seedTree(source, {
      "package.json": "{}",
      "node_modules/react/index.js": "// half-written tree, no .package-lock.json yet",
    });

    const bundle = await captureAndStoreNodeModules(makeInstance(source) as never, "hash-d", "{}");
    expect(bundle).toBeNull();
  });
});

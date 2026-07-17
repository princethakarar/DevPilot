import { describe, it, expect } from "vitest";
import { listFiles, readFile, searchCodebase, buildProjectOrientation } from "../context-tools";
import type { TemplateFolder } from "@/modules/playground/lib/path-to-json";

const tree: TemplateFolder = {
  folderName: "root",
  items: [
    { filename: "package", fileExtension: "json", content: '{"name":"demo"}' },
    {
      folderName: "src",
      items: [
        { filename: "add", fileExtension: "js", content: "function add(a, b) {\n  return a - b; // bug\n}\nmodule.exports = { add };" },
        { filename: "icon", fileExtension: "png", content: "PNG-fake-base64-payload", encoding: "base64" },
      ],
    },
  ],
};

describe("listFiles", () => {
  it("lists root contents", () => {
    const result = listFiles(tree);
    expect(result.entries).toEqual(["package.json", "src/"]);
  });
  it("lists a subdirectory's contents", () => {
    const result = listFiles(tree, "src");
    expect(result.entries.sort()).toEqual(["add.js", "icon.png"]);
  });
  it("errors on a missing directory", () => {
    const result = listFiles(tree, "does/not/exist");
    expect(result.error).toBeDefined();
  });
});

describe("readFile", () => {
  it("reads a text file's content", () => {
    const result = readFile(tree, "src/add.js");
    expect(result.content).toContain("return a - b");
  });
  it("errors on a missing file", () => {
    expect(readFile(tree, "src/missing.js").error).toBeDefined();
  });
  it("refuses to read a binary file as text", () => {
    const result = readFile(tree, "src/icon.png");
    expect(result.error).toMatch(/binary/);
  });
});

describe("searchCodebase", () => {
  it("finds a substring match with path and line number", () => {
    const result = searchCodebase(tree, "return a - b");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ path: "src/add.js", line: 2 });
  });
  it("is case-insensitive", () => {
    const result = searchCodebase(tree, "MODULE.EXPORTS");
    expect(result.matches.length).toBeGreaterThan(0);
  });
  it("returns no matches for an empty query", () => {
    expect(searchCodebase(tree, "").matches).toHaveLength(0);
  });
  it("never returns matches from a binary file", () => {
    const result = searchCodebase(tree, "PNG");
    expect(result.matches.every((m) => m.path !== "src/icon.png")).toBe(true);
  });
});

describe("buildProjectOrientation", () => {
  it("lists files with line counts and folders with a trailing slash, but no file content", () => {
    const orientation = buildProjectOrientation(tree);
    expect(orientation).toContain("package.json (1 lines)");
    expect(orientation).toContain("src/");
    expect(orientation).toContain("add.js (4 lines)");
    expect(orientation).not.toContain("return a - b");
  });

  it("omits binary files", () => {
    expect(buildProjectOrientation(tree)).not.toContain("icon.png");
  });

  it("stays small — cheap enough to pay on every turn for the whole run", () => {
    // 1500-char cap plus a little slack for the truncation notice.
    expect(buildProjectOrientation(tree).length).toBeLessThan(1600);
  });

  it("truncates and adds a notice once a project has more files than the cap", () => {
    const bigTree: TemplateFolder = {
      folderName: "root",
      items: Array.from({ length: 120 }, (_, i) => ({ filename: `file${i}`, fileExtension: "ts", content: "x" })),
    };
    const orientation = buildProjectOrientation(bigTree);
    expect(orientation).toContain("more files not shown");
  });
});

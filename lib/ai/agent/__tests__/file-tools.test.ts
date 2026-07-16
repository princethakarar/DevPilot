import { describe, it, expect } from "vitest";
import { writeFile } from "../file-tools";
import { readFile } from "../context-tools";
import type { TemplateFolder } from "@/modules/playground/lib/path-to-json";

const tree: TemplateFolder = {
  folderName: "root",
  items: [{ filename: "add", fileExtension: "js", content: "function add(a,b){return a-b}" }],
};

describe("writeFile", () => {
  it("overwrites an existing file's content immediately, no approval step", () => {
    const result = writeFile(tree, "add.js", "function add(a,b){return a+b}");
    expect(result.ok).toBe(true);
    expect(readFile(result.tree!, "add.js").content).toBe("function add(a,b){return a+b}");
  });

  it("creates a new file at a nested path that doesn't exist yet", () => {
    const result = writeFile(tree, "src/utils/new.ts", "export const x = 1;");
    expect(result.ok).toBe(true);
    expect(readFile(result.tree!, "src/utils/new.ts").content).toBe("export const x = 1;");
  });

  it("refuses to write a .env file", () => {
    const result = writeFile(tree, ".env", "SECRET=abc");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/\.env/);
  });

  it("refuses a nested .env.local file too", () => {
    const result = writeFile(tree, "server/.env.local", "SECRET=abc");
    expect(result.ok).toBe(false);
  });

  it("rejects path traversal segments", () => {
    const result = writeFile(tree, "../outside.js", "x");
    expect(result.ok).toBe(false);
  });

  it("rejects an empty path", () => {
    expect(writeFile(tree, "", "content").ok).toBe(false);
  });
});

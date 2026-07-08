import { describe, it, expect } from "vitest";
import { findSiblingNameConflict } from "../index";
import type { TemplateItem } from "../path-to-json";

const file = (filename: string, fileExtension = ""): TemplateItem => ({
  filename,
  fileExtension,
  content: "",
});

const folder = (folderName: string): TemplateItem => ({
  folderName,
  items: [],
});

describe("findSiblingNameConflict", () => {
  it("detects an exact-name collision with an existing sibling file", () => {
    const items = [file("index", "ts"), file("readme", "md")];
    expect(findSiblingNameConflict(items, "index.ts")).toBe(true);
  });

  it("is case-insensitive (case-insensitive filesystems)", () => {
    const items = [file("Index", "ts")];
    expect(findSiblingNameConflict(items, "index.TS")).toBe(true);
  });

  it("returns false when the name has no sibling collision", () => {
    const items = [file("index", "ts")];
    expect(findSiblingNameConflict(items, "app.ts")).toBe(false);
  });

  it("does not consider files in a different directory (caller only passes that directory's items)", () => {
    // Same name (".env") living in a sibling folder never appears in `items`
    // for this directory, so it can never trigger a false positive here.
    const items = [file("index", "ts")];
    expect(findSiblingNameConflict(items, ".env")).toBe(false);
  });

  it("treats a folder and a file with the same name as colliding", () => {
    const items = [folder("utils")];
    expect(findSiblingNameConflict(items, "utils")).toBe(true);
  });

  it("excludes the `skip` item so renaming a file to its own (or a re-cased) name is allowed", () => {
    const target = file("readme", "md");
    const items = [file("index", "ts"), target];
    expect(findSiblingNameConflict(items, "README.md", target)).toBe(false);
  });

  it("still blocks renaming onto a different sibling's name even when `skip` is set", () => {
    const target = file("readme", "md");
    const items = [file("index", "ts"), target];
    expect(findSiblingNameConflict(items, "index.ts", target)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { findEnvFile, injectEnvFile, stripEnvFile } from "../env-merge";
import type { TemplateFolder } from "../path-to-json";

function tree(): TemplateFolder {
  return {
    folderName: "Root",
    items: [
      {
        folderName: "server",
        items: [{ filename: ".env", fileExtension: "", content: "API_KEY=abc\n" }],
      },
      { filename: "index", fileExtension: "js", content: "console.log(1)" },
    ],
  };
}

describe("env-merge: subdirectory .env round-trip", () => {
  it("findEnvFile reports the subfolder path, not root", () => {
    const found = findEnvFile(tree());
    expect(found?.path).toEqual(["server"]);
  });

  it("stripping .env from the tree makes findEnvFile return null — this is why a stored path is required", () => {
    const stripped = stripEnvFile(tree());
    // Mirrors exactly what saveTemplateData persists to TemplateFile: no .env
    // anywhere in it. Re-deriving the original folder from this tree alone is
    // impossible — this is the bug: falling back to `findEnvFile(strippedTree)?.path`
    // always yields undefined, which silently defaulted to the root.
    expect(findEnvFile(stripped)).toBeNull();
  });

  it("re-injecting with the persisted path restores .env to its original subfolder", () => {
    const stripped = stripEnvFile(tree());
    const persistedPath = ["server"]; // what Playground.envFilePath would hold

    const restored = injectEnvFile(stripped, persistedPath, "API_KEY=abc\n");

    const found = findEnvFile(restored);
    expect(found?.path).toEqual(["server"]);
    const serverFolder = restored.items.find(
      (i): i is TemplateFolder => "folderName" in i && i.folderName === "server"
    );
    expect(serverFolder?.items.some((i) => "filename" in i && i.filename === ".env")).toBe(true);
  });

  it("re-injecting without a persisted path (legacy/never-saved data) falls back to root — the old, buggy behavior for the common case", () => {
    const stripped = stripEnvFile(tree());

    const restored = injectEnvFile(stripped, [], "API_KEY=abc\n");

    const rootHasEnv = restored.items.some((i) => "filename" in i && i.filename === ".env");
    const serverFolder = restored.items.find(
      (i): i is TemplateFolder => "folderName" in i && i.folderName === "server"
    );
    const serverHasEnv = serverFolder?.items.some((i) => "filename" in i && i.filename === ".env");

    expect(rootHasEnv).toBe(true);
    expect(serverHasEnv).toBe(false);
  });
});

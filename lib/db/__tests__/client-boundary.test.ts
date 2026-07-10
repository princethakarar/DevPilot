import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

/**
 * Replaces the old "no TCP driver" guard (removed — this app now
 * intentionally imports the native `mongodb` driver in lib/db/mongoClient.ts,
 * since MongoDB removed Atlas Data API for new accounts; see
 * ../REGRESSION_GUARD.md). The actually-relevant risk now is a TCP-capable
 * driver leaking into a Client Component bundle: `import "server-only"` at
 * the top of mongoClient.ts is the primary, Next.js-build-time enforcement
 * of that boundary. This test is a secondary, fast, CI-runnable static net —
 * it never touches a real Next.js build, so it complements rather than
 * replaces the `server-only` guard.
 */

const ROOT = path.resolve(__dirname, "../../..");
const SCAN_DIRS = ["app", "modules", "components"];
const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["']@\/lib\/db\/mongoClient["']/,
  /from\s+["']@\/lib\/db\/repositories\//,
];

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__tests__") continue;
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function isClientComponent(content: string): boolean {
  // The "use client" directive must be the first statement (only preceded by
  // comments/whitespace) to take effect — mirrors Next.js's own rule.
  const withoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .trimStart();
  return withoutComments.startsWith('"use client"') || withoutComments.startsWith("'use client'");
}

const allFiles = SCAN_DIRS.filter((d) => {
  try {
    statSync(path.join(ROOT, d));
    return true;
  } catch {
    return false;
  }
}).flatMap((d) => collectSourceFiles(path.join(ROOT, d)));

const clientFiles = allFiles.filter((f) => isClientComponent(readFileSync(f, "utf-8")));

describe("Client Components never import the MongoDB data layer directly", () => {
  it("found at least one Client Component to check (sanity check that the scan itself works)", () => {
    expect(clientFiles.length).toBeGreaterThan(0);
  });

  it.each(clientFiles.map((f) => [path.relative(ROOT, f), f] as const))(
    "%s does not import lib/db/mongoClient or lib/db/repositories",
    (_label, filePath) => {
      const content = readFileSync(filePath, "utf-8");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        expect(content).not.toMatch(pattern);
      }
    }
  );
});

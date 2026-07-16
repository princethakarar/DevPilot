import type { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import { readFile } from "./context-tools";

export type PackageManager = "npm" | "yarn" | "pnpm";

/**
 * Detects the project's package manager from its lockfile, same signal the
 * boot pipeline uses (see AGENTS.md Snapshot Pipeline) — the allowlist only
 * ever accepts commands for the ONE tool this project actually uses, so a
 * model can't e.g. run `yarn add` in an npm project and silently create a
 * second, inconsistent lockfile.
 */
export function detectPackageManager(root: TemplateFolder): PackageManager {
  if (root.items.some((item) => "filename" in item && item.filename === "yarn" && item.fileExtension === "lock")) {
    return "yarn";
  }
  if (root.items.some((item) => "filename" in item && item.filename === "pnpm-lock" && item.fileExtension === "yaml")) {
    return "pnpm";
  }
  return "npm";
}

/** package.json script names — `npm run <script>` is only allowed for a script that actually exists. */
export function getPackageJsonScripts(root: TemplateFolder): string[] {
  const result = readFile(root, "package.json");
  if (result.error || !result.content) return [];
  try {
    const parsed = JSON.parse(result.content);
    const scripts = parsed?.scripts;
    if (!scripts || typeof scripts !== "object") return [];
    return Object.keys(scripts);
  } catch {
    return [];
  }
}

export interface AllowlistCheck {
  allowed: boolean;
  reason?: string;
}

// Any of these anywhere in the command is an instant, unconditional reject —
// no attempt to parse/sanitize chained or redirected commands, per spec:
// smuggling a forbidden command behind an allowed-looking prefix is exactly
// what this blocks.
const SMUGGLING_CHARS = /&&|\|\||[;|`]|\$\(|>{1,2}|<|\n|\r/;

const PKG_SPEC = String.raw`[@]?[\w][\w@/.\-^~]*`;
const SCRIPT_NAME = String.raw`[\w:\-]+`;

interface Pattern {
  manager: PackageManager | "any";
  regex: RegExp;
  /** For npm/yarn/pnpm "run <script>" forms — the captured group index holding the script name to validate against package.json. */
  scriptGroup?: number;
}

const ALLOWED_PATTERNS: Pattern[] = [
  // npm
  { manager: "npm", regex: /^npm install$/ },
  { manager: "npm", regex: new RegExp(`^npm install( --save-dev| -D| --save| -S)? (${PKG_SPEC})( (${PKG_SPEC}))*( --save-dev| -D| --save| -S)?$`) },
  { manager: "npm", regex: new RegExp(`^npm run (${SCRIPT_NAME})$`), scriptGroup: 1 },
  { manager: "npm", regex: /^npm test$/ },
  // yarn
  { manager: "yarn", regex: /^yarn install$/ },
  { manager: "yarn", regex: new RegExp(`^yarn add (${PKG_SPEC})( (${PKG_SPEC}))*( --dev| -D)?$`) },
  { manager: "yarn", regex: new RegExp(`^yarn (?:run )?(${SCRIPT_NAME})$`), scriptGroup: 1 },
  { manager: "yarn", regex: /^yarn test$/ },
  // pnpm
  { manager: "pnpm", regex: /^pnpm install$/ },
  { manager: "pnpm", regex: new RegExp(`^pnpm add (${PKG_SPEC})( (${PKG_SPEC}))*( --save-dev| -D)?$`) },
  { manager: "pnpm", regex: new RegExp(`^pnpm run (${SCRIPT_NAME})$`), scriptGroup: 1 },
  { manager: "pnpm", regex: /^pnpm test$/ },
  // git, read-only situational awareness only
  { manager: "any", regex: /^git status$/ },
  { manager: "any", regex: /^git diff$/ },
  { manager: "any", regex: /^git diff -- [\w.\-/]+$/ },
];

const FORBIDDEN_HINTS: { test: RegExp; reason: string }[] = [
  { test: /^rm\b|^rmdir\b|^del\b/i, reason: "Destructive filesystem commands (rm/rmdir/del) are never allowed." },
  { test: /^sudo\b/i, reason: "sudo is never allowed." },
  { test: /^chmod\b|^chown\b/i, reason: "chmod/chown are never allowed." },
  { test: /^curl\b|^wget\b/i, reason: "Network calls (curl/wget) are never allowed — installs must go through npm/yarn/pnpm." },
  { test: /^git\s+push\s+.*--force|^git\s+push\s+-f\b/i, reason: "git push --force is never allowed." },
  { test: /^git\s+reset\s+--hard/i, reason: "git reset --hard is never allowed." },
  { test: /^git\s+(rebase|filter-branch|clean)\b/i, reason: "Git history rewrites are never allowed." },
];

/**
 * Server-side allowlist gate for the agent's run_command tool. This is the
 * ONLY thing standing between a model's tool call and an actual shell — never
 * trust the model's own restraint or the system prompt. Default is deny:
 * anything that doesn't match an explicit allowed pattern for the project's
 * actual package manager is rejected, with a specific reason where possible.
 */
export function checkCommandAllowed(
  rawCommand: string,
  ctx: { packageManager: PackageManager; packageJsonScripts: string[] }
): AllowlistCheck {
  const command = rawCommand.trim().replace(/\s+/g, " ");
  if (!command) return { allowed: false, reason: "Empty command." };

  if (SMUGGLING_CHARS.test(command)) {
    return {
      allowed: false,
      reason: "Command chaining, piping, redirection, or substitution characters (&&, ;, |, `, $(), >, <) are never allowed, even if part of the command would otherwise be permitted.",
    };
  }

  for (const hint of FORBIDDEN_HINTS) {
    if (hint.test.test(command)) return { allowed: false, reason: hint.reason };
  }

  for (const pattern of ALLOWED_PATTERNS) {
    if (pattern.manager !== "any" && pattern.manager !== ctx.packageManager) continue;
    const match = command.match(pattern.regex);
    if (!match) continue;
    if (pattern.scriptGroup !== undefined) {
      const scriptName = match[pattern.scriptGroup];
      if (!ctx.packageJsonScripts.includes(scriptName)) {
        return { allowed: false, reason: `"${scriptName}" is not a script defined in this project's package.json.` };
      }
    }
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Command not recognized as one of the allowed operations for this project (${ctx.packageManager}): install, run a defined script, test, or read-only git status/diff.`,
  };
}

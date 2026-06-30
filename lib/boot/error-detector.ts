export type NpmErrorCategory =
  | "eresolve"
  | "enotfound"
  | "enospc"
  | "eacces"
  | "eintegrity"
  | "e404"
  | "script_fail"
  | "unknown";

export interface InstallError {
  category: NpmErrorCategory;
  message: string;
  suggestion: string;
  retryFlags?: string[];
  retryStrategy?: "legacy-peers" | "force" | "no-optional" | "ignore-scripts";
}

export interface InstallProgress {
  added: number;
  total: number;
  percent: number;
  currentPackage?: string;
}

const ERESOLVE_RE = /(ERESOLVE|No matching version found|unable to resolve dependency tree)/i;
const ENOTFOUND_RE = /(ENOTFOUND|connect ETIMEDOUT|request to .* failed|fetch failed|network error)/i;
const ENOSPC_RE = /(ENOSPC|No space left on device|not enough space)/i;
const EACCES_RE = /(EACCES|EACCESS|permission denied)/i;
const EINTEGRITY_RE = /(EINTEGRITY|integrity check failed|sha.*mismatch)/i;
const E404_RE = /(E404|404 Not Found|code E404)/i;
const SCRIPT_FAIL_RE = /(npm ERR!.*(postinstall|preinstall|prepare).*exit)/i;
const ADDED_RE = /added\s+(\d+)\s+packages?/i;
const TOTAL_RE = /(\d+)\s+packages?\s+are\s+(installed|looking)/i;

export function detectInstallErrors(chunk: string): InstallError | null {
  if (ERESOLVE_RE.test(chunk)) {
    return {
      category: "eresolve",
      message: "Dependency conflict detected — packages require incompatible versions",
      suggestion: "Retrying with --legacy-peer-deps to resolve conflicts",
      retryFlags: ["--legacy-peer-deps"],
      retryStrategy: "legacy-peers",
    };
  }

  if (ENOTFOUND_RE.test(chunk)) {
    return {
      category: "enotfound",
      message: "Could not reach npm registry — check your internet connection",
      suggestion: "Check connection and retry, or try a different network",
    };
  }

  if (ENOSPC_RE.test(chunk)) {
    return {
      category: "enospc",
      message: "Browser tab running low on memory — try closing other tabs",
      suggestion: "Close unused tabs and refresh",
    };
  }

  if (EACCES_RE.test(chunk)) {
    return {
      category: "eacces",
      message: "Filesystem permission issue in the environment",
      suggestion: "This is unexpected in WebContainer — trying again may resolve it",
    };
  }

  if (EINTEGRITY_RE.test(chunk)) {
    return {
      category: "eintegrity",
      message: "Package integrity check failed — temporary download corruption",
      suggestion: "Retrying with clean cache",
      retryFlags: ["--prefer-offline"],
    };
  }

  if (E404_RE.test(chunk)) {
    return {
      category: "e404",
      message: "A required package version was not found on the registry",
      suggestion: "Check package.json for version typos, or retry",
    };
  }

  if (SCRIPT_FAIL_RE.test(chunk)) {
    return {
      category: "script_fail",
      message: "A package install script failed — this package may not support WebContainers",
      suggestion: "Retrying with --ignore-scripts (may need to configure the package manually)",
      retryFlags: ["--ignore-scripts"],
      retryStrategy: "ignore-scripts",
    };
  }

  return null;
}

export function parseInstallProgress(chunk: string): InstallProgress | null {
  const addedMatch = ADDED_RE.exec(chunk);
  if (addedMatch) {
    const added = parseInt(addedMatch[1], 10);
    return { added, total: 0, percent: 0, currentPackage: undefined };
  }

  if (chunk.includes("http fetch") || chunk.includes("etag")) {
    const urlMatch = chunk.match(/https?:\/\/registry\.npmjs\.org\/([^/]+)/);
    return {
      added: 0,
      total: 0,
      percent: 0,
      currentPackage: urlMatch?.[1] || undefined,
    };
  }

  return null;
}

export function classifyExitCode(
  code: number | null,
  output: string
): { suggestedAction: string; userMessage: string; isTerminal: boolean } {
  if (code === null) {
    return {
      suggestedAction: "process_killed",
      userMessage: "The process was terminated unexpectedly",
      isTerminal: false,
    };
  }

  if (code === 0) {
    return {
      suggestedAction: "none",
      userMessage: "",
      isTerminal: false,
    };
  }

  if (code === 1) {
    const resolved = detectInstallErrors(output);
    if (resolved) {
      return {
        suggestedAction: `retry:${resolved.retryStrategy || "normal"}`,
        userMessage: resolved.message,
        isTerminal: false,
      };
    }

    if (output.includes("EADDRINUSE") || output.includes("address already in use")) {
      return {
        suggestedAction: "retry:cleanup-ports",
        userMessage: "Port conflict — previous server not fully released",
        isTerminal: false,
      };
    }

    if (output.includes("Cannot find module")) {
      return {
        suggestedAction: "retry:normal",
        userMessage: "Missing package — install may be incomplete",
        isTerminal: false,
      };
    }

    return {
      suggestedAction: "retry:normal",
      userMessage: "Dev server exited unexpectedly — retrying usually fixes this",
      isTerminal: false,
    };
  }

  if (code === 127) {
    return {
      suggestedAction: "error:template-broken",
      userMessage: "The dev command was not found in this template",
      isTerminal: true,
    };
  }

  if (code === 137 || code === 128) {
    return {
      suggestedAction: "error:oom",
      userMessage: "Browser tab ran out of memory — try a lighter template",
      isTerminal: true,
    };
  }

  // exit 143 = SIGTERM — the WebContainer WASM sandbox killed the process due to
  // memory or time limits. This is NOT a dependency conflict; switching npm flags
  // doesn't help. The best strategy is to retry with --no-optional to reduce the
  // package count and lower the peak memory footprint.
  if (code === 143) {
    return {
      suggestedAction: "retry:no-optional",
      userMessage: "The install was stopped by the environment (memory pressure). Retrying with a smaller package set.",
      isTerminal: false,
    };
  }

  return {
    suggestedAction: `retry:normal`,
    userMessage: `Process exited with code ${code}`,
    isTerminal: false,
  };
}

import type { AgentModelMessage } from "./model-client";

/**
 * Keeps the per-call request size bounded instead of growing linearly with
 * loop length. Without this, every prior tool result (a full read_file's
 * content, a full command's output) stays in `messages` verbatim forever,
 * and gets resent on every subsequent call — confirmed live to blow past
 * Groq's ~6000 TPM budget (see token-budget.ts) from a SINGLE large tool
 * result, as early as the second turn of a task.
 *
 * Once a tool result has been superseded by newer ones, its full content is
 * replaced with a short, tool-aware placeholder — the model can always
 * re-call the same tool if it actually needs that content again, which is a
 * far cheaper failure mode than the whole run dying to a 413.
 */

const TRIMMED_MARKER = "[Previously ";
/** Below this, a result is already cheap enough that trimming it isn't worth losing the content. */
const MIN_TRIM_LENGTH = 200;

function summarizeToolResult(name: string, content: string): string {
  try {
    if (name === "read_file") {
      const parsed = JSON.parse(content);
      if (typeof parsed?.path === "string") {
        const lines = typeof parsed.content === "string" ? parsed.content.split("\n").length : 0;
        return `${TRIMMED_MARKER}read: ${parsed.path} — ${lines} lines, content omitted from context to save tokens, re-read if needed]`;
      }
    } else if (name === "search_codebase") {
      const parsed = JSON.parse(content);
      if (typeof parsed?.query === "string") {
        const count = Array.isArray(parsed.matches) ? parsed.matches.length : 0;
        return `${TRIMMED_MARKER}searched: "${parsed.query}" — ${count} match(es), details omitted from context to save tokens, re-search if needed]`;
      }
    } else if (name === "list_files") {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed?.entries)) {
        return `${TRIMMED_MARKER}listed: ${parsed.path ?? "/"} — ${parsed.entries.length} entries, omitted from context to save tokens, re-list if needed]`;
      }
    } else if (name === "run_command") {
      const exitMatch = content.match(/exit code: (-?\d+)/);
      return `${TRIMMED_MARKER}ran a command — exit code ${exitMatch ? exitMatch[1] : "unknown"}, output omitted from context to save tokens, re-run if needed]`;
    }
  } catch {
    // Fall through to the generic summary below — still safe to trim,
    // just without tool-specific detail.
  }
  return `${TRIMMED_MARKER}tool result omitted from context to save tokens]`;
}

/**
 * Replaces older tool-result messages with short placeholders in place,
 * leaving the `keepRecentToolResults` most recent ones (by position) full.
 * Idempotent (an already-trimmed message is left alone) and selective
 * (results already under MIN_TRIM_LENGTH are left alone — trimming a
 * one-line "OK: wrote x.ts" saves nothing and just adds noise).
 */
/**
 * Paths whose full read_file content is still live (untrimmed by the above,
 * and not stale from a later write_file) in the current message history.
 * Scans forward in order so a later write_file correctly invalidates an
 * earlier read, and a later fresh read re-establishes liveness. Used to
 * dedupe a redundant re-read of a file the model already has in front of
 * it — both the "already trimmed away" and "written since" cases fall
 * through to a real re-read, never a stale pointer to content that no
 * longer matches the file.
 */
export function findLiveReadPaths(messages: AgentModelMessage[]): Set<string> {
  const live = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== "tool") continue;
    const content = msg.content ?? "";
    if (msg.name === "write_file") {
      const match = content.match(/^OK: wrote (.+)$/);
      if (match) live.delete(match[1]);
    } else if (msg.name === "read_file" && !content.startsWith(TRIMMED_MARKER)) {
      try {
        const parsed = JSON.parse(content);
        if (typeof parsed?.path === "string" && !parsed.error) {
          live.add(parsed.path.replace(/^\/+/, ""));
        }
      } catch {
        // Not parseable JSON — nothing to mark live.
      }
    }
  }
  return live;
}

export function trimToolResultHistory(messages: AgentModelMessage[], keepRecentToolResults: number): void {
  const toolIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "tool") toolIndices.push(i);
  }

  const cutoff = Math.max(0, toolIndices.length - keepRecentToolResults);
  for (const i of toolIndices.slice(0, cutoff)) {
    const msg = messages[i];
    const content = msg.content ?? "";
    if (content.startsWith(TRIMMED_MARKER)) continue;
    if (content.length < MIN_TRIM_LENGTH) continue;
    messages[i] = { ...msg, content: summarizeToolResult(msg.name ?? "", content) };
  }
}

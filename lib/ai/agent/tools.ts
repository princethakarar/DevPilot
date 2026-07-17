/**
 * Tool definitions the autonomous agent's model may call, in Groq's
 * OpenAI-compatible `tools` shape. Kept in one place so the orchestrator's
 * routing switch and the schema sent to the model can never drift apart.
 */
export const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List a directory's immediate contents (folders end with '/'). Omit path for the project root. A file tree is already in your first message — prefer this only for a directory not shown there.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Directory path relative to the project root. Omit for root." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the full text content of one file.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File path relative to the project root." } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_files",
      description: "Read up to 4 files in one call. Prefer this over separate read_file calls whenever you already know several files you need.",
      parameters: {
        type: "object",
        properties: {
          paths: { type: "array", items: { type: "string" }, description: "File paths relative to the project root (max 4; extras are ignored)." },
        },
        required: ["paths"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_codebase",
      description: "Case-insensitive substring search across all text files. Returns matching paths, line numbers, and snippets — prefer this over reading files individually to locate something.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Text to search for." } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Overwrite (or create) a file with new content. Applies immediately — there is no approval step, so only write content you are confident is correct.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to the project root." },
          content: { type: "string", description: "The full new content of the file." },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a command in the project's terminal (install, run a package.json script, test, build, lint, or read-only git status/diff). Validated server-side against a fixed allowlist before it runs — most shell syntax (chaining, piping, redirection) will be rejected.",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "The exact command to run, e.g. 'npm run build'." } },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_complete",
      description: "Call this when the task is verifiably done (you have run a verification command and it passed). Ends the run.",
      parameters: {
        type: "object",
        properties: { summary: { type: "string", description: "A concise summary of what was done." } },
        required: ["summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_blocked",
      description: "Call this if you cannot proceed — e.g. the task is ambiguous, impossible, or requires information/access you don't have. Do not guess wildly or keep retrying the same failing approach; call this instead. Ends the run.",
      parameters: {
        type: "object",
        properties: { reason: { type: "string", description: "A clear, specific explanation of what's blocking progress." } },
        required: ["reason"],
      },
    },
  },
] as const;

export type AgentToolName =
  | "list_files"
  | "read_file"
  | "read_files"
  | "search_codebase"
  | "write_file"
  | "run_command"
  | "mark_complete"
  | "mark_blocked";

// Kept tight on purpose — this is sent on every single call, so every extra
// sentence here is a fixed per-turn cost against a 6000 TPM budget where a
// full turn's other content already runs 1-2k tokens (see token-budget.ts).
export const AGENT_SYSTEM_PROMPT = `You are DevPilot's autonomous coding agent, operating inside a real project. Your first message includes a file tree for orientation. Tools: list_files, read_file, read_files, search_codebase (read the project); write_file (applies immediately, no approval step); run_command (server-validated against an allowlist; most shell operators rejected outright); mark_complete / mark_blocked (end the run).

Rules:
- Work in a loop: call a tool, observe its result, decide the next step.
- Explore efficiently: use the file tree already given to you, prefer search_codebase over reading many files individually, and batch related reads with read_files instead of one read_file call each.
- After a meaningful batch of writes, run a verification command (lint/build/test) before considering that part of the task done. Not every trivial edit needs its own verify.
- If a command fails, fix the actual cause — don't repeat a fix that didn't work; try something genuinely different, or call mark_blocked if you're out of ideas.
- If run_command is rejected by the allowlist, don't route around it (no chaining/piping/alternate tools) — find a different permitted way, or call mark_blocked.
- If the task is ambiguous, impossible, or you're missing information you can't obtain, call mark_blocked with a specific reason rather than guessing.
- Call mark_complete only with verifiable evidence (a passing build/test/lint run) and a concise summary of what changed.
- Never ask the user a question — you cannot receive a reply. Proceed on reasonable judgment, or call mark_blocked.`;

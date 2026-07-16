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
      description: "List the immediate contents of a project directory (folders shown with a trailing '/'). Omit path to list the project root.",
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
      description: "Read the full text content of a file in the project.",
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
      name: "search_codebase",
      description: "Case-insensitive substring search across every text file in the project. Returns matching file paths, line numbers, and snippets.",
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
  | "search_codebase"
  | "write_file"
  | "run_command"
  | "mark_complete"
  | "mark_blocked";

export const AGENT_SYSTEM_PROMPT = `You are DevPilot's autonomous coding agent, operating inside a real project. You have tools to read the project (list_files, read_file, search_codebase), write files (write_file — applies immediately, no approval step), run commands (run_command — server-validated against an allowlist; most shell operators are rejected outright), and end the run (mark_complete or mark_blocked).

Rules:
- Work in a loop: call a tool, observe its result, decide the next step.
- After a meaningful batch of writes, run a verification command (lint/build/test) before considering that part of the task done. You don't need to verify after every single trivial edit.
- If a command fails, read the error carefully and fix the actual cause — don't repeat the same fix if it didn't work; try a genuinely different approach, or call mark_blocked if you're out of ideas.
- If run_command is rejected by the allowlist, do not try to route around it (no chaining, piping, or alternate tools to the same end) — find a different, permitted way to accomplish the goal, or call mark_blocked.
- If the task is ambiguous, impossible, or you're missing information you have no way to obtain, call mark_blocked with a specific reason rather than guessing.
- Call mark_complete only once you have verifiable evidence (a passing build/test/lint run) that the task is done, with a concise summary of what changed.
- Never ask the user a question — you cannot receive a reply. Either proceed on reasonable judgment, or call mark_blocked.`;

import { describe, it, expect } from "vitest";
import { trimToolResultHistory } from "../context-trim";
import type { AgentModelMessage } from "../model-client";

function toolMsg(name: string, content: string): AgentModelMessage {
  return { role: "tool", tool_call_id: `call-${name}-${content.length}`, name, content };
}

const LONG_READ_RESULT = JSON.stringify({
  path: "src/big.ts",
  content: Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n"),
});
const LONG_SEARCH_RESULT = JSON.stringify({
  query: "helper",
  matches: Array.from({ length: 10 }, (_, i) => ({ path: "a.ts", line: i, snippet: "x".repeat(30) })),
});

describe("trimToolResultHistory", () => {
  it("leaves the most recent N tool results untouched and summarizes older ones", () => {
    const messages: AgentModelMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "task" },
      toolMsg("read_file", LONG_READ_RESULT),
      toolMsg("search_codebase", LONG_SEARCH_RESULT),
    ];

    trimToolResultHistory(messages, 1);

    expect(messages[2].content).toMatch(/^\[Previously read: src\/big\.ts — 50 lines/);
    expect(messages[3].content).toBe(LONG_SEARCH_RESULT); // most recent — untouched
  });

  it("is idempotent — trimming an already-trimmed message a second time is a no-op", () => {
    const messages: AgentModelMessage[] = [toolMsg("read_file", LONG_READ_RESULT), toolMsg("read_file", LONG_READ_RESULT)];
    trimToolResultHistory(messages, 0);
    const afterFirstTrim = messages[0].content;
    trimToolResultHistory(messages, 0);
    expect(messages[0].content).toBe(afterFirstTrim);
  });

  it("never trims results already under the minimum length — nothing to save", () => {
    const messages: AgentModelMessage[] = [toolMsg("write_file", "OK: wrote src/x.ts"), toolMsg("write_file", "OK: wrote src/y.ts")];
    trimToolResultHistory(messages, 0);
    expect(messages[0].content).toBe("OK: wrote src/x.ts");
    expect(messages[1].content).toBe("OK: wrote src/y.ts");
  });

  it("summarizes a run_command result with its exit code preserved", () => {
    const messages: AgentModelMessage[] = [
      toolMsg("run_command", `exit code: 1\n\nstderr:\n${"x".repeat(300)}`),
      toolMsg("run_command", "exit code: 0"),
    ];
    trimToolResultHistory(messages, 0);
    expect(messages[0].content).toMatch(/^\[Previously ran a command — exit code 1,/);
  });

  it("keepRecentToolResults=0 trims every tool result, including the most recent", () => {
    const messages: AgentModelMessage[] = [toolMsg("read_file", LONG_READ_RESULT)];
    trimToolResultHistory(messages, 0);
    expect(messages[0].content).toMatch(/^\[Previously read:/);
  });

  it("only counts tool-role messages toward the keep-recent window, ignoring assistant/user messages in between", () => {
    const messages: AgentModelMessage[] = [
      toolMsg("read_file", LONG_READ_RESULT),
      { role: "assistant", content: "thinking", tool_calls: [] },
      toolMsg("search_codebase", LONG_SEARCH_RESULT),
    ];
    trimToolResultHistory(messages, 1);
    expect(messages[0].content).toMatch(/^\[Previously read:/);
    expect(messages[2].content).toBe(LONG_SEARCH_RESULT);
  });

  it("falls back to a generic summary for malformed JSON tool results instead of throwing", () => {
    const messages: AgentModelMessage[] = [toolMsg("read_file", "not json ".repeat(30)), toolMsg("read_file", "y".repeat(300))];
    expect(() => trimToolResultHistory(messages, 0)).not.toThrow();
    expect(messages[0].content).toBe("[Previously tool result omitted from context to save tokens]");
  });
});

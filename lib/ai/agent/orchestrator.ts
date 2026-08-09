import type { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import { findPlaygroundWithTemplateFiles } from "@/lib/db/repositories/playgrounds";
import { upsertTemplateFileForPlayground } from "@/lib/db/repositories/templateFiles";
import { createCheckpoint } from "@/lib/checkpoint/store";
import {
  appendAgentRunLog,
  incrementAgentRunCounters,
  finishAgentRun,
  setAgentRunCheckpointBefore,
  findAgentRunById,
} from "@/lib/db/repositories/agentRuns";
import { listFiles, readFile, searchCodebase, buildProjectOrientation, MAX_BATCH_READ_FILES } from "./context-tools";
import { writeFile } from "./file-tools";
import { checkCommandAllowed, detectPackageManager, getPackageJsonScripts } from "./allowlist";
import { type AgentModelMessage, AgentModelError } from "./model-client";
import { AGENT_SYSTEM_PROMPT } from "./tools";
import { AGENT_CAPS, StallTracker } from "./stall-detector";
import { emitRunEvent, isStopRequested, getStopSignal, requestBrowserCommand, type CommandExecutionResult } from "./relay";
import { trimToolResultHistory, findLiveReadPaths } from "./context-trim";
import { callModelWithRateLimitHandling, createModelFallbackState, activeModel } from "./rate-limit-retry";
import { exceedsSafeBudget } from "./token-budget";

// Only the most recent tool result is kept in full on every turn — evidence-
// driven, not the spec's "1-2" range's upper bound: a single real file read
// already exceeded the ENTIRE budget, so keeping 2 full results is not a
// safe default here.
const MAX_FULL_TOOL_RESULTS = 1;

function alreadyProvidedNote(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  return `Already provided above in this run's context for ${normalized} — no need to re-read unless the file may have changed since.`;
}

export interface RunAgentParams {
  runId: string;
  playgroundId: string;
  task: string;
}

// npm/yarn/pnpm install/run/test commands (the only ones the allowlist ever
// permits besides near-instant read-only git status/diff) can legitimately
// take well over the old flat 45s budget inside a WASM-sandboxed WebContainer
// — confirmed live: `npm run build` (tsc && vite build, a small project) was
// still genuinely running past two full minutes, well past the 45s and then
// 120s this was first raised to. tsc's cold startup inside WebContainer's
// WASM VFS is apparently far slower than native, independent of project
// size — see AGENTS.md's "Boot Reliability System" for the same class of
// WASM filesystem slowness after an install. git status/diff stay on the
// short default since they're effectively instant and a hung one likely
// does mean a dead tab.
const SLOW_COMMAND_TIMEOUT_MS = 240_000;
function commandTimeoutMs(command: string): number {
  return /^(npm|yarn|pnpm)\b/.test(command.trim()) ? SLOW_COMMAND_TIMEOUT_MS : 45_000;
}

function shortSummary(text: string, max = 72): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

// Was 100 — far too generous for a 6000 TPM budget where the LAST N lines of
// stdout/stderr are almost always what matters for diagnosing a failure.
function truncateLines(text: string, maxLines = 40): string {
  if (!text) return "";
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return `…[truncated, showing last ${maxLines} of ${lines.length} lines]…\n${lines.slice(-maxLines).join("\n")}`;
}

function formatCommandResult(r: CommandExecutionResult): string {
  return [
    `exit code: ${r.exitCode}`,
    r.stdout ? `stdout:\n${truncateLines(r.stdout)}` : null,
    r.stderr ? `stderr:\n${truncateLines(r.stderr)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function log(runId: string, type: "status" | "model" | "tool_call" | "tool_result" | "checkpoint" | "error", message: string, detail?: unknown): Promise<void> {
  emitRunEvent(runId, type === "tool_call"
    ? { type, tool: (detail as { tool?: string })?.tool ?? "", args: (detail as { args?: Record<string, unknown> })?.args ?? {} }
    : type === "tool_result"
    ? { type, tool: (detail as { tool?: string })?.tool ?? "", result: (detail as { result?: unknown })?.result }
    : type === "checkpoint"
    ? { type, message, checkpointId: (detail as { checkpointId?: string | null })?.checkpointId ?? null }
    : { type: type as "status" | "model" | "error", message });
  await appendAgentRunLog(runId, { ts: new Date(), type, message, detail: detail ?? null }).catch(() => {});
}

/**
 * Runs one autonomous task end-to-end: pre-checkpoint, model/tool loop with
 * hard caps + stall detection, post-checkpoint. Never throws — any failure
 * ends the run with status "failed" and is logged, so the caller (the SSE
 * route) only needs to stream events and doesn't need its own try/catch.
 */
export async function runAgentOrchestrator({ runId, playgroundId, task }: RunAgentParams): Promise<void> {
  const startedAt = Date.now();

  try {
    const playground = await findPlaygroundWithTemplateFiles(playgroundId);
    if (!playground) {
      await finishAgentRun(runId, { status: "failed", blockedReason: "Project not found." });
      emitRunEvent(runId, { type: "done", status: "failed", blockedReason: "Project not found." });
      return;
    }

    const rawContent = playground.templateFiles[0]?.content;
    let tree: TemplateFolder = typeof rawContent === "string" ? JSON.parse(rawContent) : (rawContent as TemplateFolder);
    if (!tree || !Array.isArray(tree.items)) {
      await finishAgentRun(runId, { status: "failed", blockedReason: "Project file tree could not be loaded." });
      emitRunEvent(runId, { type: "done", status: "failed", blockedReason: "Project file tree could not be loaded." });
      return;
    }

    await log(runId, "status", "Starting task — creating pre-task checkpoint…");

    // ---- Phase 4: mandatory pre-write checkpoint. A failed checkpoint means
    // there is no safety net, so the run stops here — no writes have happened
    // yet, nothing to roll back, nothing lost. Unlike the earlier git-commit
    // design, a Redis snapshot has no "nothing changed" case to special-case —
    // it always writes a fresh point-in-time copy.
    const preCheckpoint = await createCheckpoint(playgroundId, `Before: ${shortSummary(task)}`, task);
    let checkpointBeforeId: string | null = null;
    if (preCheckpoint.ok) {
      checkpointBeforeId = preCheckpoint.checkpoint.id;
      await setAgentRunCheckpointBefore(runId, checkpointBeforeId);
      await log(runId, "checkpoint", "Pre-task checkpoint created.", { checkpointId: checkpointBeforeId });
    } else {
      const reason = `Could not create the pre-task checkpoint (${preCheckpoint.error}). Stopping before making any changes — no safety net, no writes.`;
      await log(runId, "error", reason);
      await finishAgentRun(runId, { status: "failed", blockedReason: reason });
      emitRunEvent(runId, { type: "done", status: "failed", blockedReason: reason });
      return;
    }

    const orientation = buildProjectOrientation(tree);
    const messages: AgentModelMessage[] = [
      { role: "system", content: AGENT_SYSTEM_PROMPT },
      { role: "user", content: `Task: ${task}\n\nProject file tree (for orientation — use list_files/read_file/search_codebase for anything not shown here):\n${orientation}` },
    ];

    // Created once, up front — must exist before the first requestStop() call
    // for this run so that call's abort() actually reaches every wait below
    // (getStopSignal creates the controller lazily, keyed by runId).
    const stopSignal = getStopSignal(runId);
    // Shared across every turn of this run — once one turn falls back to the
    // secondary model (rate-limit-retry.ts), every later turn starts there
    // too instead of re-trying the already-known-bad primary from scratch.
    const modelFallbackState = createModelFallbackState();
    const stallTracker = new StallTracker();
    let toolCallCount = 0;
    let approxTokens = 0;
    let finalStatus: "completed" | "blocked" | "capped" | "stopped" = "blocked";
    let summary: string | null = null;
    let blockedReason: string | null = "The agent ended without calling mark_complete or mark_blocked.";
    let consecutiveNoToolCalls = 0;

    loop: while (true) {
      if (Date.now() - startedAt > AGENT_CAPS.maxWallClockMs) {
        finalStatus = "capped";
        blockedReason = `Stopped after hitting the ${Math.round(AGENT_CAPS.maxWallClockMs / 60000)}-minute time cap.`;
        break;
      }
      if (toolCallCount >= AGENT_CAPS.maxToolCalls) {
        finalStatus = "capped";
        blockedReason = `Stopped after hitting the ${AGENT_CAPS.maxToolCalls}-tool-call cap.`;
        break;
      }
      if (approxTokens >= AGENT_CAPS.maxApproxTokens) {
        finalStatus = "capped";
        blockedReason = `Stopped after hitting the token/cost cap for this run.`;
        break;
      }
      if (isStopRequested(runId)) {
        finalStatus = "stopped";
        blockedReason = "Stopped by user request.";
        break;
      }

      await incrementAgentRunCounters(runId, { iterationCount: 1 }).catch(() => {});

      // Bound the request size before every call: keep only the most recent
      // tool result in full, and if the estimate is still creeping close to
      // the TPM budget, trim harder (including the most recent) rather than
      // wait for a 413 to force the issue reactively.
      trimToolResultHistory(messages, MAX_FULL_TOOL_RESULTS);
      // Checked against whichever model this turn will actually use: the two
      // have different TPM ceilings (12k vs 6k), so a single shared threshold
      // both over-trimmed the primary and under-trimmed the fallback.
      if (exceedsSafeBudget(messages, activeModel(modelFallbackState))) {
        trimToolResultHistory(messages, 0);
        await log(runId, "status", "Context is large — trimming older tool results to stay under the AI provider's rate limit…");
      }

      await log(runId, "model", "Thinking…");

      let outcome: Awaited<ReturnType<typeof callModelWithRateLimitHandling>>;
      try {
        outcome = await callModelWithRateLimitHandling(
          messages,
          (statusMessage) => log(runId, "status", statusMessage),
          undefined,
          stopSignal,
          modelFallbackState
        );
      } catch (err) {
        // A user-requested stop aborts the in-flight fetch (relay.ts's
        // getStopSignal), which surfaces here as a raw AbortError, not a
        // clean outcome — check for that first so Stop reports "stopped",
        // not a scary "model could not be reached".
        if (isStopRequested(runId)) {
          finalStatus = "stopped";
          blockedReason = "Stopped by user request.";
          break;
        }
        const message = err instanceof AgentModelError ? err.message : String(err);
        await log(runId, "error", `Model call failed: ${message}`);
        finalStatus = "blocked";
        blockedReason = `The model could not be reached: ${message}`;
        break;
      }

      if (!outcome.ok) {
        if (isStopRequested(runId)) {
          finalStatus = "stopped";
          blockedReason = "Stopped by user request.";
          break;
        }
        finalStatus = "blocked";
        blockedReason = outcome.reason;
        await log(
          runId,
          "error",
          outcome.reason,
          outcome.failedGeneration ? { failedGeneration: outcome.failedGeneration.slice(0, 1000) } : undefined
        );
        break;
      }

      const result = outcome.result;
      approxTokens += result.approxTokens;
      await incrementAgentRunCounters(runId, { approxTokens: result.approxTokens }).catch(() => {});
      messages.push(result.message);

      if (result.toolCalls.length === 0) {
        consecutiveNoToolCalls += 1;
        if (consecutiveNoToolCalls >= 2) {
          finalStatus = "blocked";
          blockedReason = "The model stopped calling tools without signaling completion or being blocked.";
          break;
        }
        messages.push({
          role: "user",
          content: "You must call a tool on every turn. If the task is verifiably done, call mark_complete. If you cannot proceed, call mark_blocked. Do not just reply with text.",
        });
        continue;
      }
      consecutiveNoToolCalls = 0;

      for (const call of result.toolCalls) {
        if (isStopRequested(runId)) {
          finalStatus = "stopped";
          blockedReason = "Stopped by user request.";
          break loop;
        }

        toolCallCount += 1;
        await incrementAgentRunCounters(runId, { toolCallCount: 1 }).catch(() => {});
        await log(runId, "tool_call", `${call.name}(${JSON.stringify(call.arguments).slice(0, 200)})`, { tool: call.name, args: call.arguments });

        let toolResultContent: string;

        switch (call.name) {
          case "list_files": {
            const r = listFiles(tree, call.arguments.path as string | undefined);
            toolResultContent = JSON.stringify(r);
            break;
          }
          case "read_file": {
            const p = String(call.arguments.path ?? "");
            const normalized = p.replace(/^\/+/, "");
            toolResultContent = findLiveReadPaths(messages).has(normalized)
              ? JSON.stringify({ path: p, note: alreadyProvidedNote(p) })
              : JSON.stringify(readFile(tree, p));
            break;
          }
          case "read_files": {
            const rawPaths = Array.isArray(call.arguments.paths) ? call.arguments.paths : [];
            const paths = rawPaths.map((x) => String(x)).slice(0, MAX_BATCH_READ_FILES);
            const live = findLiveReadPaths(messages);
            const files = paths.map((p) => {
              const normalized = p.replace(/^\/+/, "");
              return live.has(normalized) ? { path: p, note: alreadyProvidedNote(p) } : readFile(tree, p);
            });
            toolResultContent = JSON.stringify({ files });
            break;
          }
          case "search_codebase": {
            const r = searchCodebase(tree, String(call.arguments.query ?? ""));
            toolResultContent = JSON.stringify(r);
            break;
          }
          case "write_file": {
            const r = writeFile(tree, String(call.arguments.path ?? ""), String(call.arguments.content ?? ""));
            if (r.ok && r.tree) {
              tree = r.tree;
              await upsertTemplateFileForPlayground(playgroundId, JSON.stringify(tree));
              emitRunEvent(runId, { type: "sync_file", path: r.path, content: String(call.arguments.content ?? "") });
              toolResultContent = `OK: wrote ${r.path}`;
            } else {
              toolResultContent = `ERROR: ${r.error}`;
            }
            break;
          }
          case "run_command": {
            const command = String(call.arguments.command ?? "");
            const packageManager = detectPackageManager(tree);
            const packageJsonScripts = getPackageJsonScripts(tree);
            const check = checkCommandAllowed(command, { packageManager, packageJsonScripts });
            if (!check.allowed) {
              toolResultContent = `REJECTED: ${check.reason}`;
              const stall = stallTracker.recordFailure(`REJECTED:${check.reason}`);
              await log(runId, "error", `Command rejected: ${command} — ${check.reason}`);
              if (stall.stalled) {
                finalStatus = "blocked";
                blockedReason = `The agent attempted the same rejected command repeatedly without finding an allowed alternative (${check.reason}).`;
                messages.push({ role: "tool", tool_call_id: call.id, name: call.name, content: toolResultContent });
                break loop;
              }
            } else {
              try {
                const execResult = await requestBrowserCommand(runId, command, commandTimeoutMs(command));
                toolResultContent = formatCommandResult(execResult);
                if (execResult.exitCode === 0) {
                  stallTracker.recordSuccess();
                } else {
                  const stall = stallTracker.recordFailure(`${execResult.stderr}\n${execResult.stdout}`);
                  if (stall.stalled) {
                    finalStatus = "blocked";
                    blockedReason = `The agent attempted the same fix repeatedly (${stall.streak}x) without resolving the error: ${stall.signature}`;
                    messages.push({ role: "tool", tool_call_id: call.id, name: call.name, content: toolResultContent });
                    await log(runId, "tool_result", `run_command -> exit ${execResult.exitCode} (stalled)`, { tool: call.name, result: toolResultContent.slice(0, 500) });
                    break loop;
                  }
                }
              } catch (err) {
                toolResultContent = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
              }
            }
            break;
          }
          case "mark_complete": {
            summary = String(call.arguments.summary ?? "Task completed.");
            finalStatus = "completed";
            blockedReason = null;
            messages.push({ role: "tool", tool_call_id: call.id, name: call.name, content: "Run ending: marked complete." });
            await log(runId, "status", `mark_complete: ${summary}`);
            break loop;
          }
          case "mark_blocked": {
            blockedReason = String(call.arguments.reason ?? "Blocked.");
            finalStatus = "blocked";
            messages.push({ role: "tool", tool_call_id: call.id, name: call.name, content: "Run ending: marked blocked." });
            await log(runId, "status", `mark_blocked: ${blockedReason}`);
            break loop;
          }
          default: {
            toolResultContent = `ERROR: unknown tool "${call.name}"`;
          }
        }

        await log(runId, "tool_result", `${call.name} -> ${toolResultContent.slice(0, 200)}`, { tool: call.name, result: toolResultContent.slice(0, 2000) });
        messages.push({ role: "tool", tool_call_id: call.id, name: call.name, content: toolResultContent });
      }
    }

    // ---- Phase 4: mandatory post-loop checkpoint, regardless of outcome.
    await log(runId, "status", `Run ending (${finalStatus}) — creating final checkpoint…`);
    const postLabel = finalStatus === "completed" ? `After: ${shortSummary(summary ?? task)}` : `After (incomplete): ${shortSummary(task)}`;
    const postCheckpoint = await createCheckpoint(playgroundId, postLabel, summary ?? blockedReason ?? task);
    let checkpointAfterId: string | null = null;
    if (postCheckpoint.ok) {
      checkpointAfterId = postCheckpoint.checkpoint.id;
      await log(runId, "checkpoint", "Final checkpoint created.", { checkpointId: checkpointAfterId });
    } else {
      await log(runId, "error", `Final checkpoint failed: ${postCheckpoint.error}. Changes remain saved in the project, but this run has no post-task rollback point.`);
    }

    await finishAgentRun(runId, { status: finalStatus, summary, blockedReason, checkpointAfterId });
    emitRunEvent(runId, { type: "done", status: finalStatus, summary, blockedReason });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendAgentRunLog(runId, { ts: new Date(), type: "error", message: `Run failed unexpectedly: ${message}` }).catch(() => {});
    await finishAgentRun(runId, { status: "failed", blockedReason: `Run failed unexpectedly: ${message}` }).catch(() => {});
    emitRunEvent(runId, { type: "done", status: "failed", blockedReason: message });
  }
}

/** Read-only snapshot used by the GET status endpoint. */
export async function getAgentRunSnapshot(runId: string) {
  return findAgentRunById(runId);
}

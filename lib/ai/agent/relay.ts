import { randomUUID } from "crypto";

/**
 * In-process relay between the server-side orchestrator loop (this Next.js
 * Node process) and the single browser tab that owns the run's live
 * WebContainer instance. WebContainer is a browser-only sandbox — there is no
 * server-side handle to it — so `run_command` and the WebContainer half of a
 * file write have to be pushed to the browser over the run's SSE stream and
 * their results posted back to resume the loop. In-memory only, same
 * single-process tradeoff already accepted by lib/ai/rate-limiter.ts: fine
 * for this app's current deployment, not multi-instance-safe.
 */

export type RelayEvent =
  | { type: "status"; message: string }
  | { type: "model"; message: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown> }
  | { type: "tool_result"; tool: string; result: unknown }
  | { type: "checkpoint"; message: string; checkpointId?: string | null }
  | { type: "error"; message: string }
  | { type: "execute_command"; callId: string; command: string }
  | { type: "sync_file"; path: string; content: string }
  | { type: "done"; status: string; summary?: string | null; blockedReason?: string | null };

export interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

type Emitter = (event: RelayEvent) => void;

const emitters = new Map<string, Emitter>();
const stopFlags = new Set<string>();

interface PendingExecution {
  resolve: (result: CommandExecutionResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingExecutions = new Map<string, PendingExecution>();

export function registerRunEmitter(runId: string, emit: Emitter): void {
  emitters.set(runId, emit);
}

export function unregisterRunEmitter(runId: string): void {
  emitters.delete(runId);
  // Fail any executions still waiting on a browser that just disconnected,
  // rather than leaving them to hang until their own timeout.
  for (const [key, pending] of pendingExecutions) {
    if (key.startsWith(`${runId}:`)) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Browser tab disconnected before this command finished."));
      pendingExecutions.delete(key);
    }
  }
}

export function emitRunEvent(runId: string, event: RelayEvent): void {
  emitters.get(runId)?.(event);
}

export function requestStop(runId: string): void {
  stopFlags.add(runId);
}

export function isStopRequested(runId: string): boolean {
  return stopFlags.has(runId);
}

export function clearStop(runId: string): void {
  stopFlags.delete(runId);
}

/**
 * Pushes a run_command execution request to the browser and waits for its
 * result. Rejects on timeout (browser tab closed/unresponsive) so the
 * orchestrator loop can never hang forever on a single tool call.
 */
export function requestBrowserCommand(runId: string, command: string, timeoutMs = 45_000): Promise<CommandExecutionResult> {
  const callId = randomUUID();
  const key = `${runId}:${callId}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingExecutions.delete(key);
      reject(new Error("Timed out waiting for the browser to run this command — is the project tab still open?"));
    }, timeoutMs);
    pendingExecutions.set(key, { resolve, reject, timer });
    emitRunEvent(runId, { type: "execute_command", callId, command });
  });
}

export function resolveBrowserCommand(runId: string, callId: string, result: CommandExecutionResult): boolean {
  const key = `${runId}:${callId}`;
  const pending = pendingExecutions.get(key);
  if (!pending) return false;
  clearTimeout(pending.timer);
  pendingExecutions.delete(key);
  pending.resolve(result);
  return true;
}

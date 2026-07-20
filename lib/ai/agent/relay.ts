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
  | { type: "execute_command"; callId: string; command: string; timeoutMs: number }
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
// One AbortController per run, created lazily so a run that's never had
// requestStop() called against it doesn't need one. Backs getStopSignal(),
// which lets long waits (the model fetch, rate-limit backoff, run_command)
// react to a stop the instant it's requested instead of only at the next
// loop-boundary poll — see requestStop()'s doc comment for why polling alone
// wasn't enough.
const stopControllers = new Map<string, AbortController>();

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

/**
 * The kill switch. Setting the flag alone only takes effect the next time
 * the orchestrator loop reaches a poll point (loop top, between tool calls)
 * — fine most of the time, but the loop can be sitting in a single await for
 * a long time: a `run_command` waiting on the browser (up to 240s for
 * npm/yarn/pnpm, see orchestrator.ts's commandTimeoutMs) or the model call
 * pacing/backing off for a rate limit (up to ~75s, see token-budget.ts). A
 * user who clicks Stop during either of those was, in practice, watching a
 * run that "doesn't stop" for up to minutes. So requestStop also actively
 * unblocks whatever the loop is currently waiting on: it aborts this run's
 * stop signal (getStopSignal — combined into the model fetch's AbortSignal
 * and polled by the token-budget pacing wait) and immediately fails any
 * run_command call still waiting on the browser, the same way
 * unregisterRunEmitter already does for a disconnected tab.
 */
export function requestStop(runId: string): void {
  stopFlags.add(runId);
  // Create-then-abort, not get-then-maybe-abort: the Stop button appears
  // (and can be clicked) the instant the client fires the start request,
  // which can race ahead of the orchestrator reaching its own
  // getStopSignal(runId) call. Getting the controller here first guarantees
  // that whenever the orchestrator does call getStopSignal for this runId,
  // it receives the same (already-aborted) controller instead of a fresh,
  // unaborted one that silently drops this stop request.
  getOrCreateStopController(runId).abort();
  for (const [key, pending] of pendingExecutions) {
    if (key.startsWith(`${runId}:`)) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Stopped by user request."));
      pendingExecutions.delete(key);
    }
  }
}

export function isStopRequested(runId: string): boolean {
  return stopFlags.has(runId);
}

function getOrCreateStopController(runId: string): AbortController {
  let controller = stopControllers.get(runId);
  if (!controller) {
    controller = new AbortController();
    stopControllers.set(runId, controller);
  }
  return controller;
}

/** Lazily creates this run's stop AbortController and returns its signal. */
export function getStopSignal(runId: string): AbortSignal {
  return getOrCreateStopController(runId).signal;
}

export function clearStop(runId: string): void {
  stopFlags.delete(runId);
  stopControllers.delete(runId);
}

/**
 * Pushes a run_command execution request to the browser and waits for its
 * result. Rejects on timeout (browser tab closed/unresponsive) so the
 * orchestrator loop can never hang forever on a single tool call.
 *
 * `timeoutMs` is passed through to the browser in the same event (see
 * useAgentRun.ts's "execute_command" handler) so both sides agree on the
 * budget — the browser proactively kills the process and reports a clean
 * timeout result a little before this deadline, rather than the two sides
 * silently diverging: a real command that's still genuinely running when
 * this timer fires would otherwise finish later and call resolveBrowserCommand
 * against an already-discarded entry, silently dropping the result.
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
    emitRunEvent(runId, { type: "execute_command", callId, command, timeoutMs });
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

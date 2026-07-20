"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AgentRunUiStatus = "idle" | "running" | "completed" | "blocked" | "capped" | "stopped" | "failed";

export interface AgentLogEntry {
  id: string;
  ts: number;
  type: "status" | "model" | "tool_call" | "tool_result" | "checkpoint" | "error";
  message: string;
}

interface StartError {
  code?: string;
  message: string;
}

interface UseAgentRunOptions {
  projectId: string;
  /** Returns the live WebContainer instance for this playground, or null if not booted/available yet. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getInstance: () => any | null;
  /** Called when the agent writes a file, so the open editor/explorer can reflect it live. */
  onFileSynced?: (path: string, content: string) => void;
}

interface RelayEvent {
  type: string;
  message?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  checkpointId?: string | null;
  callId?: string;
  command?: string;
  timeoutMs?: number;
  path?: string;
  content?: string;
  status?: string;
  summary?: string | null;
  blockedReason?: string | null;
}

function truncate(value: unknown, max = 160): string {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function useAgentRun({ projectId, getInstance, onFileSynced }: UseAgentRunOptions) {
  const [status, setStatus] = useState<AgentRunUiStatus>("idle");
  const [log, setLog] = useState<AgentLogEntry[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [iterationCount, setIterationCount] = useState(0);
  const [toolCallCount, setToolCallCount] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [startError, setStartError] = useState<StartError | null>(null);
  const [checkpointBeforeId, setCheckpointBeforeId] = useState<string | null>(null);
  const [checkpointAfterId, setCheckpointAfterId] = useState<string | null>(null);

  const runIdRef = useRef<string | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Stop can be clicked in the window between the Stop button appearing
  // (status flips to "running" synchronously in start()) and runIdRef
  // actually being populated (only after the POST's response headers land).
  // Without this, that click silently no-ops — nothing to POST to yet.
  const stopRequestedRef = useRef(false);
  const [stopRequested, setStopRequested] = useState(false);

  const postStop = useCallback(async (id: string) => {
    try {
      await fetch(`/api/ai/agent/run/${id}/stop`, { method: "POST" });
    } catch {
      // The reader loop will still end once the server finishes its stop sequence.
    }
  }, []);

  const appendLog = useCallback((entry: Omit<AgentLogEntry, "id">) => {
    setLog((prev) => [...prev, { ...entry, id: `${entry.ts}-${prev.length}` }]);
  }, []);

  const postToolResult = useCallback(async (callId: string, result: { stdout: string; stderr: string; exitCode: number }) => {
    const id = runIdRef.current;
    if (!id) return;
    try {
      await fetch(`/api/ai/agent/run/${id}/tool-result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, ...result }),
      });
    } catch {
      // Best-effort — the server-side wait will time out and the loop will surface the failure itself.
    }
  }, []);

  const handleEvent = useCallback(
    async (event: RelayEvent) => {
      switch (event.type) {
        case "status":
          appendLog({ ts: Date.now(), type: "status", message: event.message ?? "" });
          break;
        case "model":
          setIterationCount((c) => c + 1);
          appendLog({ ts: Date.now(), type: "model", message: event.message ?? "" });
          break;
        case "tool_call":
          setToolCallCount((c) => c + 1);
          appendLog({ ts: Date.now(), type: "tool_call", message: `${event.tool}(${truncate(event.args, 120)})` });
          break;
        case "tool_result":
          appendLog({ ts: Date.now(), type: "tool_result", message: `${event.tool} → ${truncate(event.result)}` });
          break;
        case "checkpoint":
          appendLog({ ts: Date.now(), type: "checkpoint", message: event.message ?? "" });
          break;
        case "error":
          appendLog({ ts: Date.now(), type: "error", message: event.message ?? "" });
          break;
        case "sync_file": {
          const instance = getInstance();
          if (instance && event.path && typeof event.content === "string") {
            try {
              const parts = event.path.split("/");
              const folder = parts.slice(0, -1).join("/");
              if (folder) await instance.fs.mkdir(folder, { recursive: true });
              await instance.fs.writeFile(event.path, event.content);
            } catch {
              // Non-fatal — the DB write already succeeded (authoritative); this is just live-editor/WC mirroring.
            }
          }
          if (event.path && typeof event.content === "string") onFileSynced?.(event.path, event.content);
          break;
        }
        case "execute_command": {
          const callId = event.callId!;
          const instance = getInstance();
          appendLog({ ts: Date.now(), type: "tool_call", message: `$ ${event.command}` });
          if (!instance) {
            await postToolResult(callId, { stdout: "", stderr: "WebContainer is not available in this browser tab.", exitCode: 1 });
            break;
          }
          // Kill and report a clean timeout a comfortable margin before the
          // server's own deadline (see relay.ts's requestBrowserCommand) so a
          // genuinely slow-but-alive command gets a real result instead of
          // the server giving up first and silently discarding whatever we
          // post after. The margin needs to cover kill() + draining any
          // remaining buffered output + the network round trip to
          // /tool-result, not just network latency — 3s wasn't enough in
          // practice for a build that was killed right at the wire.
          const budgetMs = Math.max((event.timeoutMs ?? 45_000) - 15_000, 5000);
          try {
            const parts = (event.command ?? "").trim().split(/\s+/);
            const [cmd, ...args] = parts;
            const proc = await instance.spawn(cmd, args);

            let timedOut = false;
            const timeoutTimer = setTimeout(() => {
              timedOut = true;
              try {
                proc.kill();
              } catch {
                // Best-effort — if kill() itself fails the process is likely already gone.
              }
            }, budgetMs);

            let output = "";
            try {
              const reader = proc.output.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                output += typeof value === "string" ? value : new TextDecoder().decode(value);
              }
            } finally {
              clearTimeout(timeoutTimer);
            }

            if (timedOut) {
              await postToolResult(callId, {
                stdout: output,
                stderr: `Command timed out after ${Math.round(budgetMs / 1000)}s and was killed.`,
                exitCode: 1,
              });
              break;
            }

            const exitCode: number = await proc.exit;
            await postToolResult(callId, { stdout: output, stderr: "", exitCode });
          } catch (err) {
            await postToolResult(callId, { stdout: "", stderr: err instanceof Error ? err.message : String(err), exitCode: 1 });
          }
          break;
        }
        case "done": {
          setStatus((event.status as AgentRunUiStatus) ?? "failed");
          setSummary(event.summary ?? null);
          setBlockedReason(event.blockedReason ?? null);
          const id = runIdRef.current;
          if (id) {
            try {
              const res = await fetch(`/api/ai/agent/run/${id}`);
              if (res.ok) {
                const { run } = await res.json();
                setCheckpointBeforeId(run?.checkpointBeforeId ?? null);
                setCheckpointAfterId(run?.checkpointAfterId ?? null);
              }
            } catch {
              // Checkpoint links are a convenience for the UI, not required for the run's own correctness.
            }
          }
          break;
        }
        default:
          break;
      }
    },
    [appendLog, getInstance, onFileSynced, postToolResult]
  );

  const start = useCallback(
    async (task: string) => {
      setStartError(null);
      setLog([]);
      setSummary(null);
      setBlockedReason(null);
      setIterationCount(0);
      setToolCallCount(0);
      setCheckpointBeforeId(null);
      setCheckpointAfterId(null);
      setStatus("running");
      setStartedAt(Date.now());
      stopRequestedRef.current = false;
      setStopRequested(false);

      try {
        const res = await fetch("/api/ai/agent/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, task }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          setStatus("failed");
          setStartError({ code: data.error, message: data.message || data.error || `Failed to start run (${res.status})` });
          return;
        }

        const id = res.headers.get("X-Run-Id");
        runIdRef.current = id;
        setRunId(id);
        if (id && stopRequestedRef.current) void postStop(id);

        const reader = res.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";
          for (const chunk of lines) {
            const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const event = JSON.parse(dataLine.slice(6)) as RelayEvent;
              await handleEvent(event);
            } catch {
              // ignore malformed line
            }
          }
        }
      } catch (err) {
        setStatus((prev) => (prev === "running" ? "failed" : prev));
        setStartError({ message: err instanceof Error ? err.message : "Connection to the agent lost." });
      } finally {
        readerRef.current = null;
      }
    },
    [projectId, handleEvent, postStop]
  );

  const stop = useCallback(async () => {
    setStopRequested(true);
    const id = runIdRef.current;
    if (!id) {
      // Run hasn't been assigned an id yet (still waiting on the start
      // request's response) — flag it so start() fires the stop the moment
      // the id arrives, instead of this click silently doing nothing.
      stopRequestedRef.current = true;
      return;
    }
    await postStop(id);
  }, [postStop]);

  useEffect(() => {
    if (status !== "running" || startedAt === null) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, startedAt]);

  useEffect(() => {
    return () => {
      readerRef.current?.cancel().catch(() => {});
    };
  }, []);

  return {
    status,
    log,
    runId,
    iterationCount,
    toolCallCount,
    elapsedMs,
    summary,
    blockedReason,
    startError,
    checkpointBeforeId,
    checkpointAfterId,
    stopRequested,
    start,
    stop,
  };
}

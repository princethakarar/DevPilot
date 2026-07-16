"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Bot, Square, RotateCcw, AlertTriangle, CheckCircle2, Ban, TimerReset, History, Clock } from "lucide-react";
import { useAgentRun, type AgentLogEntry } from "../hooks/useAgentRun";
import { useFileExplorer } from "../hooks/useFileExplorer";
import { revertPlaygroundToCheckpoint, listProjectCheckpoints } from "../actions/agent-revert";
import { CHECKPOINT_TTL_HOURS } from "@/lib/checkpoint/constants";

interface CheckpointSummary {
  id: string;
  label: string;
  reason: string;
  createdAt: number;
}

interface AgentPanelProps {
  playgroundId: string;
  // WebContainer instance — kept as `any` to match the rest of the IDE layer
  // (ide-terminal.tsx, ide-layout.tsx), which doesn't import the WebContainer type either.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any;
  /** Refreshes playground/template data from the DB — called after a run ends and after a restore. */
  onRunFinished: () => void;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function logEntryTone(entry: AgentLogEntry): string {
  if (entry.type === "error") return "text-red-400";
  if (entry.type === "checkpoint") return "text-amber-400";
  if (entry.type === "tool_call") return "text-sky-300";
  if (entry.type === "tool_result") {
    if (/^(ERROR|REJECTED)/.test(entry.message.split("→")[1]?.trim() ?? "")) return "text-red-400";
    return "text-emerald-400";
  }
  if (entry.type === "model") return "text-purple-300";
  return "text-foreground/60";
}

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  completed: { label: "Completed", icon: <CheckCircle2 className="h-4 w-4" />, color: "text-emerald-400" },
  blocked: { label: "Blocked", icon: <Ban className="h-4 w-4" />, color: "text-amber-400" },
  capped: { label: "Stopped at cap", icon: <TimerReset className="h-4 w-4" />, color: "text-amber-400" },
  stopped: { label: "Stopped", icon: <Square className="h-4 w-4" />, color: "text-foreground/60" },
  failed: { label: "Failed", icon: <AlertTriangle className="h-4 w-4" />, color: "text-red-400" },
};

export function AgentPanel({ playgroundId, instance, onRunFinished }: AgentPanelProps) {
  const [task, setTask] = useState("");
  const logEndRef = useRef<HTMLDivElement>(null);

  const [checkpoints, setCheckpoints] = useState<CheckpointSummary[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [expiredIds, setExpiredIds] = useState<Set<string>>(new Set());

  const refreshCheckpoints = useCallback(async () => {
    const result = await listProjectCheckpoints(playgroundId);
    setCheckpoints(result.checkpoints);
  }, [playgroundId]);

  useEffect(() => {
    refreshCheckpoints();
  }, [refreshCheckpoints]);

  const handleFileSynced = (path: string, content: string) => {
    const state = useFileExplorer.getState();
    const openFile = state.openFiles.find((f) => f.id === path);
    if (!openFile) return;
    // Mirrors the change into the open tab without flagging it dirty — it's
    // already persisted server-side by the time this event arrives.
    state.setOpenFiles(
      state.openFiles.map((f) => (f.id === path ? { ...f, content, originalContent: content, hasUnsavedChanges: false } : f))
    );
    if (state.activeFileId === path) state.setEditorContent(content);
  };

  const { status, log, iterationCount, toolCallCount, elapsedMs, summary, blockedReason, startError, start, stop } = useAgentRun({
    projectId: playgroundId,
    getInstance: () => instance,
    onFileSynced: handleFileSynced,
  });

  const isRunning = status === "running";
  const isFinished = ["completed", "blocked", "capped", "stopped", "failed"].includes(status);

  useEffect(() => {
    // Fires at both checkpoint-creation moments (run start = pre-task
    // checkpoint, run end = post-task checkpoint) without needing to parse
    // individual log lines — cheap to just refetch the small history list.
    refreshCheckpoints();
    if (isFinished) onRunFinished();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  const handleStart = () => {
    if (!task.trim() || isRunning) return;
    start(task.trim());
  };

  const handleRestore = async (checkpoint: CheckpointSummary) => {
    setRestoringId(checkpoint.id);
    try {
      const result = await revertPlaygroundToCheckpoint(playgroundId, checkpoint.id);
      if (result.status === "restored") {
        toast.success("Project restored to this checkpoint.");
        onRunFinished();
        refreshCheckpoints();
      } else if (result.status === "expired") {
        setExpiredIds((prev) => new Set(prev).add(checkpoint.id));
      } else {
        toast.error(result.error || "Failed to restore checkpoint.");
      }
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 p-3 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-foreground/70" />
          <span className="text-xs font-semibold text-foreground">Autonomous Agent</span>
        </div>
        <Textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Describe a task — e.g. 'Add input validation to the signup form and make sure it builds.'"
          disabled={isRunning}
          className="min-h-[64px] text-xs resize-none"
        />
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <Button size="sm" className="flex-1" disabled={!task.trim()} onClick={handleStart}>
              Run Autonomous Task
            </Button>
          ) : (
            <Button size="sm" variant="destructive" className="flex-1" onClick={stop}>
              <Square className="h-3.5 w-3.5 mr-1.5" /> Stop
            </Button>
          )}
        </div>
        {isRunning && (
          <div className="flex items-center gap-3 text-[11px] text-foreground/60">
            <span>Iteration {iterationCount}</span>
            <span>{toolCallCount} tool calls</span>
            <span>{formatElapsed(elapsedMs)} elapsed</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1 font-mono min-h-0">
        {log.length === 0 && !isRunning && (
          <p className="text-xs text-foreground/40 font-sans">Activity will appear here once a task starts running.</p>
        )}
        {log.map((entry) => (
          <div key={entry.id} className={cn("text-[11px] leading-relaxed break-words", logEntryTone(entry))}>
            {entry.message}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>

      {startError && (
        <div className="shrink-0 p-3 border-t border-border bg-red-500/5">
          <p className="text-xs text-red-400">{startError.message}</p>
        </div>
      )}

      {isFinished && (
        <div className="shrink-0 p-3 border-t border-border space-y-1">
          <div className={cn("flex items-center gap-2 text-xs font-semibold", STATUS_META[status]?.color)}>
            {STATUS_META[status]?.icon}
            {STATUS_META[status]?.label}
          </div>
          {summary && <p className="text-xs text-foreground/70">{summary}</p>}
          {blockedReason && <p className="text-xs text-foreground/70">{blockedReason}</p>}
        </div>
      )}

      <div className="shrink-0 border-t border-border">
        <div className="flex items-center gap-1.5 px-3 pt-2 text-xs font-semibold text-foreground">
          <History className="h-3.5 w-3.5 text-foreground/60" />
          Checkpoints
        </div>
        <div className="max-h-40 overflow-y-auto px-3 py-2 space-y-1.5">
          {checkpoints.length === 0 && <p className="text-[11px] text-foreground/40">No checkpoints yet — one is created automatically before and after every task run.</p>}
          {checkpoints.map((cp) => (
            <div key={cp.id} className="flex items-center justify-between gap-2 text-[11px]">
              {expiredIds.has(cp.id) ? (
                <span className="text-amber-400">This checkpoint has expired and is no longer available.</span>
              ) : (
                <>
                  <div className="min-w-0">
                    <div className="truncate text-foreground/80">{cp.label}</div>
                    <div className="text-foreground/40">{formatRelativeTime(cp.createdAt)}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px] shrink-0"
                    disabled={restoringId === cp.id}
                    onClick={() => handleRestore(cp)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {restoringId === cp.id ? "Restoring…" : "Restore"}
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 px-3 pb-2 text-[10px] text-foreground/40">
          <Clock className="h-3 w-3" />
          Checkpoints are kept for {CHECKPOINT_TTL_HOURS} hours.
        </div>
      </div>
    </div>
  );
}

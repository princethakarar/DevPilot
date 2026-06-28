"use client";

import {
  Loader2, CheckCircle2, XCircle, Cloud, Database, Wifi,
  HardDrive, Terminal, AlertTriangle, RefreshCw, Maximize2,
} from "lucide-react";
import type { SnapshotProgress } from "@/lib/snapshot/types";
import { Progress } from "@/components/ui/progress";

interface DependencyStatusProps {
  progress?: SnapshotProgress;
  method?: "snapshot" | "cache" | "npm-install";
  errorCategory?: string;
  errorSuggestion?: string;
  retryCount?: number;
  maxRetries?: number;
  currentStrategy?: string;
  onRetry?: () => void;
}

function MethodBadge({ method }: { method: DependencyStatusProps["method"] }) {
  if (!method) return null;

  const config = {
    cache: { icon: Database, text: "From Cache", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
    snapshot: { icon: Cloud, text: "Pre-built", color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/20" },
    "npm-install": { icon: Wifi, text: "Fresh Install", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  };

  const c = config[method];
  const Icon = c.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${c.color} ${c.bg} ${c.border}`}>
      <Icon className="h-3 w-3" />
      {c.text}
    </span>
  );
}

function PhaseIcon({ phase, retryCount }: { phase: SnapshotProgress["phase"]; retryCount?: number }) {
  if (phase === "error") return <XCircle className="h-4 w-4 text-red-400 shrink-0" />;
  if (retryCount && retryCount > 0) return <RefreshCw className="h-4 w-4 text-amber-400 shrink-0 animate-spin" />;

  switch (phase) {
    case "checking-cache": return <Database className="h-4 w-4 text-indigo-400 shrink-0 animate-pulse" />;
    case "fetching": return <Cloud className="h-4 w-4 text-sky-400 shrink-0 animate-bounce" />;
    case "decompressing": return <HardDrive className="h-4 w-4 text-violet-400 shrink-0 animate-spin" />;
    case "extracting": return <Terminal className="h-4 w-4 text-amber-400 shrink-0" />;
    case "installing": return <Loader2 className="h-4 w-4 text-amber-400 shrink-0 animate-spin" />;
    default: return <Loader2 className="h-4 w-4 text-sky-400 shrink-0 animate-spin" />;
  }
}

function PhaseLabel({ phase }: { phase: SnapshotProgress["phase"] }) {
  const labels: Record<string, string> = {
    "checking-cache": "Checking local cache",
    fetching: "Downloading dependencies",
    decompressing: "Decompressing",
    extracting: "Extracting files",
    installing: "Installing via npm",
    mounting: "Finalizing",
    starting: "Starting server",
    ready: "Ready",
    error: "Error",
  };
  return labels[phase] || phase;
}

function TransferBar({ loaded, total }: { loaded?: number; total?: number }) {
  if (!total || !loaded) return null;

  const pct = Math.min(100, Math.round((loaded / total) * 100));
  const loadedMb = (loaded / 1_000_000).toFixed(1);
  const totalMb = (total / 1_000_000).toFixed(1);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-[#7ca8cc] font-jetbrains">
        <span>{loadedMb} MB / {totalMb} MB</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1 bg-[#020B1F] rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FileProgress({ extracted, total }: { extracted?: number; total?: number }) {
  if (!extracted) return null;
  if (total && total > 0) return <span className="text-[10px] text-[#7ca8cc] font-jetbrains">{extracted} / {total} files</span>;
  return <span className="text-[10px] text-[#7ca8cc] font-jetbrains">{extracted} files extracted</span>;
}

function RetryBadge({ count, max }: { count: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold font-jetbrains bg-amber-500/15 text-amber-300 border border-amber-500/20">
      <RefreshCw className="h-2.5 w-2.5" />
      Attempt {count + 1} / {max + 1}
    </span>
  );
}

function ErrorCard({ category, suggestion, onRetry }: {
  category?: string;
  suggestion?: string;
  onRetry?: () => void;
}) {
  const isTerminal = category?.startsWith("error:");

  const actionLabel = (() => {
    if (!category) return "Retry";
    if (category.includes("legacy-peers") || category.includes("normal")) return "Auto-fix & Retry";
    if (category.includes("compatibility")) return "Use Compatibility Mode";
    if (category === "error:oom") return "Refresh Tab";
    if (category === "error:template-broken") return "Use React+Vite";
    return "Retry";
  })();

  return (
    <div className="space-y-2 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold font-jetbrains text-amber-300">
            {isTerminal ? "Cannot Continue" : "Trouble setting up"}
          </p>
          {suggestion && (
            <p className="text-[9px] text-[#7ca8cc] font-jetbrains mt-0.5 leading-relaxed">
              {suggestion}
            </p>
          )}
        </div>
      </div>

      {onRetry && !isTerminal && (
        <button
          onClick={onRetry}
          className="w-full text-[10px] font-semibold font-jetbrains text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <RefreshCw className="h-3 w-3" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function DependencyStatus({
  progress, method, errorCategory, errorSuggestion,
  retryCount, maxRetries, currentStrategy, onRetry,
}: DependencyStatusProps) {
  if (!progress) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-[#7ca8cc] font-jetbrains">
        <Loader2 className="h-3 w-3 animate-spin text-sky-400" />
        <span>Initializing...</span>
      </div>
    );
  }

  const isError = progress.phase === "error";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {isError ? (
            <XCircle className="h-4 w-4 text-red-400 shrink-0" />
          ) : (
            <PhaseIcon phase={progress.phase} retryCount={retryCount} />
          )}
          <span className={`text-[11px] font-semibold font-jetbrains truncate ${isError ? "text-red-400" : "text-[#e8f4ff]"}`}>
            <PhaseLabel phase={progress.phase} />
          </span>
        </div>
        <div className="flex items-center gap-2">
          {retryCount !== undefined && maxRetries !== undefined && retryCount > 0 && (
            <RetryBadge count={retryCount} max={maxRetries} />
          )}
          <MethodBadge method={method} />
        </div>
      </div>

      {currentStrategy && !isError && (
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-indigo-400 font-jetbrains bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">
            {currentStrategy}
          </span>
        </div>
      )}

      {progress.message && !isError && (
        <p className="text-[10px] text-[#7ca8cc] font-jetbrains leading-relaxed line-clamp-2">
          {progress.message}
        </p>
      )}

      {isError && (
        <ErrorCard
          category={errorCategory}
          suggestion={errorSuggestion || progress.error || progress.message}
          onRetry={onRetry}
        />
      )}

      {!isError && (
        <>
          <TransferBar loaded={progress.loadedBytes} total={progress.totalBytes} />
          <FileProgress extracted={progress.extractedFiles} total={progress.totalFiles} />
        </>
      )}
    </div>
  );
}

export function DependencyBadge({ phase, retryCount }: {
  phase: SnapshotProgress["phase"];
  retryCount?: number;
}) {
  if (phase === "ready" || phase === "mounting" || phase === "starting") return null;

  const colors: Record<string, string> = {
    "checking-cache": "bg-indigo-500/20 text-indigo-300",
    fetching: "bg-sky-500/20 text-sky-300",
    decompressing: "bg-violet-500/20 text-violet-300",
    extracting: "bg-amber-500/20 text-amber-300",
    installing: "bg-amber-500/20 text-amber-300",
    error: "bg-red-500/20 text-red-300",
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold font-jetbrains ${colors[phase] || "bg-sky-500/20 text-sky-300"}`}>
      {retryCount && retryCount > 0 ? (
        <RefreshCw className="h-2.5 w-2.5 animate-spin" />
      ) : (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      )}
      <PhaseLabel phase={phase} />
    </span>
  );
}

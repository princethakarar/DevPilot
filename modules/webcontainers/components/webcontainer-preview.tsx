"use client";
import React, { useEffect, useState, useRef } from "react";

import { Loader2, XCircle, AlertTriangle, RefreshCw, Lightbulb } from "lucide-react";
import { Progress } from "@/components/ui/progress";

import { WebContainer } from "@webcontainer/api";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import dynamic from "next/dynamic";
import { useProjectBoot } from "../hooks/useProjectBoot";
import { DependencyStatus } from "./dependency-status";

const TerminalComponent = dynamic(() => import("./terminal"), { ssr: false });

interface WebContainerPreviewProps {
  templateData: TemplateFolder;
  serverUrl: string;
  isLoading: boolean;
  error: string | null;
  instance: WebContainer | null;
  writeFileSync: (path: string, content: string) => Promise<void>;
  forceResetup?: boolean;
}

const TEMPLATE_ID_MAP: Record<string, string> = {
  "react-ts": "react-vite",
  nextjs: "nextjs",
  vue: "vue",
  "express-simple": "vanilla",
  "hono-nodejs-starter": "vanilla",
  angular: "vanilla",
};

const ERROR_LIGHTER_TEMPLATES: Record<string, string> = {
  nextjs: "react-vite",
  angular: "react-vite",
  vue: "vanilla",
  astro: "vanilla",
};

function detectTemplateId(templateData: TemplateFolder): string {
  if (!templateData?.folderName) return "vanilla";
  return TEMPLATE_ID_MAP[templateData.folderName] || "vanilla";
}

const ERROR_ACTIONS: Record<string, { label: string; action: string }> = {
  "retry:legacy-peers": { label: "Auto-fix & Retry", action: "retry" },
  "retry:cleanup-ports": { label: "Retry (Clean Ports)", action: "retry" },
  "retry:normal": { label: "Retry", action: "retry" },
  "error:oom": { label: "Refresh Tab", action: "refresh" },
  "error:template-broken": { label: "Use React+Vite", action: "switch-template" },
};

function getErrorAction(category?: string): { label: string; action: string } {
  if (!category) return { label: "Retry", action: "retry" };
  // Match prefixes
  for (const [prefix, action] of Object.entries(ERROR_ACTIONS)) {
    if (category.startsWith(prefix)) return action;
  }
  return { label: "Retry", action: "retry" };
}

const WebContainerPreview = ({
  templateData,
  error,
  instance,
  isLoading,
  serverUrl,
  writeFileSync,
  forceResetup = false,
}: WebContainerPreviewProps) => {
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const terminalRef = useRef<any>(null);

  const templateId = detectTemplateId(templateData);

  const {
    bootState,
    isReady,
    isError,
    retry,
  } = useProjectBoot({
    instance,
    templateId: templateId as any,
    templateData: templateData as any,
    enabled: !forceResetup && !!instance && !!templateData && !isLoading,
  });

  useEffect(() => {
    if (forceResetup) {
      setPreviewUrl("");
      setSetupError(null);
    }
  }, [forceResetup]);

  useEffect(() => {
    if (bootState.phase === "starting-server") {
      if (terminalRef.current?.writeToTerminal) {
        terminalRef.current.writeToTerminal(`🚀 ${bootState.message}\r\n`);
      }
    }
  }, [bootState.phase, bootState.message]);

  useEffect(() => {
    if (bootState.phase === "ready") {
      setPreviewUrl("ready");
    }
  }, [bootState.phase]);

  useEffect(() => {
    if (bootState.phase === "error" && bootState.error) {
      if (terminalRef.current?.writeToTerminal) {
        terminalRef.current.writeToTerminal(`❌ ${bootState.error}\r\n`);
        if (bootState.errorSuggestion) {
          terminalRef.current.writeToTerminal(`💡 ${bootState.errorSuggestion}\r\n`);
        }
      }
    }
  }, [bootState.error, bootState.errorSuggestion]);

  const totalBootProgress = bootState.progress;
  const errorAction = getErrorAction(bootState.errorCategory);
  const lighterTemplate = ERROR_LIGHTER_TEMPLATES[templateId];

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#020B1F]">
        <div className="text-center space-y-4 max-w-sm p-8 rounded-2xl border border-[rgba(0,212,255,0.15)] bg-[#071428]/80 shadow-[0_0_30px_rgba(0,212,255,0.08)] backdrop-blur-md">
          <Loader2 className="h-8 w-8 animate-spin text-[#00D4FF] drop-shadow-[0_0_6px_rgba(0,212,255,0.5)] mx-auto" />
          <h3 className="text-sm font-bold font-jetbrains text-white uppercase tracking-wider">Initializing Env</h3>
          <p className="text-xs text-[#7ca8cc] font-jetbrains leading-relaxed">Spawning micro-container and allocating runtime resources...</p>
        </div>
      </div>
    );
  }

  if (error || (setupError && !bootState.phase)) {
    return (
      <div className="h-full flex items-center justify-center bg-[#020B1F]">
        <div className="bg-rose-500/10 border border-rose-500/25 p-6 rounded-2xl max-w-md shadow-[0_0_20px_rgba(244,63,94,0.05)]">
          <div className="flex items-center gap-2 mb-3 text-rose-400 font-jetbrains">
            <XCircle className="h-5 w-5" />
            <h3 className="font-bold text-xs uppercase tracking-wider">Initialization Error</h3>
          </div>
          <p className="text-xs font-jetbrains text-[#e8f4ff] bg-black/30 p-3 rounded-lg overflow-x-auto border border-rose-500/10">
            {error || setupError}
          </p>
        </div>
      </div>
    );
  }

  function renderErrorActions() {
    if (!isError) return null;

    const actions: React.ReactNode[] = [];

    if (errorAction.action === "retry") {
      actions.push(
        <button
          key="retry"
          onClick={retry}
          className="flex-1 text-[10px] font-semibold font-jetbrains text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <RefreshCw className="h-3 w-3" />
          {errorAction.label}
        </button>
      );
    }

    if (lighterTemplate) {
      actions.push(
        <button
          key="switch"
          className="flex-1 text-[10px] font-semibold font-jetbrains text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
        >
          <Lightbulb className="h-3 w-3" />
          Try {lighterTemplate}
        </button>
      );
    }

    return (
      <div className="flex gap-2">
        {actions}
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-[#020B1F]/60 backdrop-blur-md">
      {!previewUrl || bootState.phase !== "ready" ? (
        <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[#071428]/80 border border-[rgba(0,212,255,0.15)] shadow-[0_0_30px_rgba(0,212,255,0.08)] mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold font-jetbrains text-white uppercase tracking-wider">
                {bootState.phase === "mounting-sources" ? "Opening Project"
                  : bootState.phase === "loading-dependencies" ? "Loading Dependencies"
                  : bootState.phase === "verifying" ? "Verifying"
                  : bootState.phase === "starting-server" ? "Starting Server"
                  : bootState.phase === "error" ? "Error"
                  : "Initializing"}
              </h3>
              <span className="text-xs font-semibold font-jetbrains text-[#00D4FF]">{totalBootProgress}%</span>
            </div>

            <Progress
              value={totalBootProgress}
              className="h-1.5 bg-[#020B1F] [&>div]:bg-gradient-to-r [&>div]:from-[#00D4FF] [&>div]:via-[#3B82F6] [&>div]:to-[#8B5CF6]"
            />

            <DependencyStatus
              progress={bootState.dependencyProgress}
              errorCategory={bootState.errorCategory}
              errorSuggestion={bootState.errorSuggestion}
              retryCount={bootState.retryCount}
              maxRetries={bootState.maxRetries}
              currentStrategy={bootState.currentStrategy}
              onRetry={retry}
            />

            {isError && renderErrorActions()}
          </div>

          <div className="flex-1 p-1 rounded-2xl border border-[rgba(0,212,255,0.08)] bg-[#020B1F]/40 overflow-hidden shadow-2xl">
            <TerminalComponent
              ref={terminalRef}
              webContainerInstance={instance}
              theme="dark"
              className="h-full rounded-2xl"
            />
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col">
          <div className="flex-1 relative bg-white">
            <iframe
              src={previewUrl}
              className="w-full h-full border-none"
              title="WebContainer Preview"
            />
          </div>

          <div className="h-64 border-t border-[rgba(0,212,255,0.1)] bg-[#020B1F]/80 p-2 relative">
            <div className="absolute top-2.5 right-4 z-10 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
              <span className="text-[9px] font-bold text-[#7ca8cc] font-jetbrains uppercase tracking-widest">WebContainer Terminal</span>
            </div>
            <TerminalComponent
              ref={terminalRef}
              webContainerInstance={instance}
              theme="dark"
              className="h-full rounded-xl overflow-hidden"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default WebContainerPreview;

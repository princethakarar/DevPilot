"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { WebContainer } from "@webcontainer/api";
import type { TemplateId } from "@/lib/snapshot/types";
import type { BootState } from "@/lib/project-booter";
import { bootProject } from "@/lib/project-booter";

export interface UseProjectBootOptions {
  instance: WebContainer | null;
  templateId: TemplateId;
  templateData: { folderName: string; items: any[] } | null;
  enabled: boolean;
}

export interface UseProjectBootReturn {
  bootState: BootState;
  isReady: boolean;
  isError: boolean;
  previewUrl: string | null;
  retry: () => void;
  cancel: () => void;
  reset: () => void;
}

const initialState: BootState = {
  phase: "booting",
  progress: 0,
  message: "Waiting...",
};

export function useProjectBoot({
  instance,
  templateId,
  templateData,
  enabled,
}: UseProjectBootOptions): UseProjectBootReturn {
  const [bootState, setBootState] = useState<BootState>(initialState);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const isBootingRef = useRef(false);

  useEffect(() => {
    if (!instance || !templateData || !enabled) return;
    if (isBootingRef.current) return;

    isBootingRef.current = true;

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;

    setBootState(initialState);
    setPreviewUrl(null);

    async function runBoot() {
      try {
        const result = await bootProject({
          instance: instance!,
          templateId,
          templateData: templateData!,
          onBootState: (state) => {
            if (abortController.signal.aborted) return;
            setBootState(state);
          },
          signal: abortController.signal,
        });

        if (abortController.signal.aborted) return;

        if (result.success && result.previewUrl) {
          setPreviewUrl(result.previewUrl);
        } else if (!result.success && result.error !== "Cancelled") {
          setBootState((prev) => ({
            ...prev,
            phase: "error",
            error: result.error,
          }));
        }
      } catch (err) {
        if (abortController.signal.aborted) return;
        setBootState((prev) => ({
          ...prev,
          phase: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        }));
      } finally {
        isBootingRef.current = false;
      }
    }

    runBoot();

    return () => {
      abortController.abort();
      abortRef.current = null;
      isBootingRef.current = false;
    };

  }, [instance, templateId, templateData, enabled, retryCount]);

  const retry = useCallback(() => {
    abortRef.current?.abort();
    isBootingRef.current = false;
    setBootState(initialState);
    setPreviewUrl(null);
    setRetryCount((c) => c + 1);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    isBootingRef.current = false;
    setBootState((prev) => ({ 
      ...prev, 
      phase: "booting", 
      message: "Cancelled" 
    }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    isBootingRef.current = false;
    setBootState(initialState);
    setPreviewUrl(null);
  }, []);

  return {
    bootState,
    isReady: bootState.phase === "ready",
    isError: bootState.phase === "error",
    previewUrl,
    retry,
    cancel,
    reset,
  };
}

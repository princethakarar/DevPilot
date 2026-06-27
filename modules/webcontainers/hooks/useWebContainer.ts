"use client"
import { useState, useEffect, useCallback } from "react";
import { WebContainer } from "@webcontainer/api";
import { getWebContainer, prebootWebContainer } from "@/lib/webcontainer";

interface UseWebContaierReturn {
  serverUrl: string | null;
  isLoading: boolean;
  error: string | null;
  instance: WebContainer | null;
  writeFileSync: (path: string, content: string) => Promise<void>;
  destory: () => void;
}

// Kick off boot immediately when this module is first imported — runs in
// parallel with any async work the playground page does (template fetch, etc.)
prebootWebContainer();

export const useWebContainer = (): UseWebContaierReturn => {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<WebContainer | null>(null);

  useEffect(() => {
    let mounted = true;

    getWebContainer()
      .then((wc) => {
        if (!mounted) return;
        setInstance(wc);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to initialize WebContainer:", err);
        if (!mounted) return;
        setError(
          err instanceof Error ? err.message : "Failed to initialize WebContainer"
        );
        setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const writeFileSync = useCallback(
    async (path: string, content: string): Promise<void> => {
      if (!instance) {
        throw new Error("WebContainer instance is not available");
      }
      try {
        const folderPath = path.split("/").slice(0, -1).join("/");
        if (folderPath) {
          await instance.fs.mkdir(folderPath, { recursive: true });
        }
        await instance.fs.writeFile(path, content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to write file";
        throw new Error(`Failed to write file at ${path}: ${msg}`);
      }
    },
    [instance]
  );

  const destory = useCallback(() => {
    if (instance) {
      instance.teardown();
      setInstance(null);
      setServerUrl(null);
    }
  }, [instance]);

  return { serverUrl, isLoading, error, instance, writeFileSync, destory };
};

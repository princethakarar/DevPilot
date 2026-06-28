"use client"
import { useState, useEffect, useCallback } from "react";
import { WebContainer } from "@webcontainer/api";

interface UseWebContainerReturn {
  serverUrl: string | null;
  isLoading: boolean;
  error: string | null;
  instance: WebContainer | null;
  writeFileSync: (path: string, content: string) => Promise<void>;
  destroy: () => void;
}

async function getWebContainerInstance(): Promise<WebContainer> {
  if (typeof window === "undefined") {
    throw new Error("WebContainer can only be booted in the browser");
  }

  const win = window as any;
  if (!win.__webcontainerInstancePromise) {
    win.__webcontainerInstancePromise = WebContainer.boot();
  }
  return win.__webcontainerInstancePromise;
}

// Boot the WebContainer as early as possible — call this at module load time
// so the promise is already in-flight before the component even mounts.
if (typeof window !== "undefined" && !(window as any).__webcontainerInstancePromise) {
  getWebContainerInstance();
}

export const useWebContainer = (): UseWebContainerReturn => {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<WebContainer | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initializeWebContainer() {
      try {
        const webcontainerInstance = await getWebContainerInstance();

        if (!mounted) return;

        setInstance(webcontainerInstance);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to initialize WebContainer:", error);
        if (mounted) {
          setError(
            error instanceof Error
              ? error.message
              : "Failed to initialize WebContainer"
          );
          setIsLoading(false);
        }
      }
    }

    initializeWebContainer();

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
        const pathParts = path.split("/");
        const folderPath = pathParts.slice(0, -1).join("/");

        if (folderPath) {
          await instance.fs.mkdir(folderPath, { recursive: true });
        }

        await instance.fs.writeFile(path, content);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to write file";
        console.error(`Failed to write file at ${path}:`, err);
        throw new Error(`Failed to write file at ${path}: ${errorMessage}`);
      }
    },
    [instance]
  );

  const destroy = useCallback(() => {
    if (instance) {
      try { instance.teardown(); } catch {}

      // Clear cached promise so next boot gets a fresh instance
      if (typeof window !== "undefined") {
        (window as any).__webcontainerInstancePromise = null;
      }

      setInstance(null);
      setServerUrl(null);
      setIsLoading(true);
      setError(null);
    }
  }, [instance]);

  return { serverUrl, isLoading, error, instance, writeFileSync, destroy }
};

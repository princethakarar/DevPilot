"use client";

import { useEffect, useRef } from "react";
import type { WebContainer } from "@webcontainer/api";
import type { TemplateFolder, TemplateItem } from "@/modules/playground/lib/path-to-json";
import {
  computePackageJsonHash,
  tryRestoreNodeModules,
  watchForInstallCompletion,
  captureAndStoreNodeModules,
} from "../lib/node-modules-persistence";

function findPackageJsonContent(folder: TemplateFolder): string | null {
  for (const item of folder.items as TemplateItem[]) {
    if ("filename" in item) {
      if (item.filename === "package" && item.fileExtension === "json") return item.content;
    } else if ("folderName" in item) {
      const nested = findPackageJsonContent(item);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Best-effort node_modules persistence across refreshes. Call only once the
 * project's own files have already been mounted into `instance` (pass `null`
 * for `templateData` until then) to avoid racing WebContainer's own mount().
 *
 * See node-modules-persistence.ts for what this can and can't actually do —
 * short version: WebContainer can't reconnect to a prior instance across a
 * page reload, so this restores a cached node_modules snapshot into a fresh
 * instance instead of avoiding the reload's teardown entirely.
 */
export function useNodeModulesPersistence(
  instance: WebContainer | null,
  playgroundId: string | null | undefined,
  templateData: TemplateFolder | null
) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (!instance || !playgroundId || !templateData || startedRef.current) return;
    startedRef.current = true;

    let cleanupWatch: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const pkgJson = findPackageJsonContent(templateData);
        if (!pkgJson) return;

        const pkgHash = await computePackageJsonHash(pkgJson);
        if (cancelled) return;

        const restored = await tryRestoreNodeModules(instance, playgroundId, pkgHash);
        if (restored) {
          console.info("[DevPilot] Restored node_modules from local cache — no install needed.");
        }
        if (cancelled) return;

        cleanupWatch = watchForInstallCompletion(instance, () => {
          captureAndStoreNodeModules(instance, playgroundId, pkgHash).catch(() => {});
        });
      } catch (err) {
        console.warn("[DevPilot] node_modules persistence setup failed (non-fatal):", err);
      }
    })();

    return () => {
      cancelled = true;
      cleanupWatch?.();
    };
  }, [instance, playgroundId, templateData]);
}

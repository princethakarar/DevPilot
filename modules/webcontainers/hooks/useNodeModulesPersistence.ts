"use client";

import { useEffect, useRef } from "react";
import type { WebContainer } from "@webcontainer/api";
import { toast } from "sonner";
import type { TemplateFolder, TemplateItem } from "@/modules/playground/lib/path-to-json";
import { fallbackToNpmInstall } from "@/lib/snapshot/loader";
import { checkForPartialInstall } from "@/lib/boot/install-verifier";
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

function hasDeclaredDependencies(pkgJson: string): boolean {
  try {
    const parsed = JSON.parse(pkgJson);
    return (
      Object.keys(parsed.dependencies ?? {}).length > 0 ||
      Object.keys(parsed.devDependencies ?? {}).length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Best-effort node_modules persistence across refreshes AND across different
 * playgrounds. Call only once the project's own files have already been
 * mounted into `instance` (pass `null` for `templateData` until then) to
 * avoid racing WebContainer's own mount().
 *
 * The cache is keyed purely on the package.json content hash (see
 * node-modules-persistence.ts), so a brand new playground built from the same
 * starter template as one already installed elsewhere restores instantly
 * instead of paying a fresh `npm install`.
 *
 * If nothing is cached and the template declares real dependencies, this also
 * kicks off `npm install` automatically (toast-driven progress) so the user
 * never has to type it themselves — the freshly-installed tree then gets
 * captured into the cache below for the next playground that needs it.
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

        let restored = await tryRestoreNodeModules(instance, pkgHash);
        if (restored) {
          // The IndexedDB bundle format can't represent symlinks (see
          // node-modules-persistence.ts's walkDir), so node_modules/.bin —
          // which npm populates entirely with symlinks — never makes it into
          // the cache. A restore that "succeeds" can still leave every
          // package script (dev/build/etc.) unable to resolve its binary.
          // Verify before trusting it, and repair with a real install if not.
          const broken = await checkForPartialInstall(instance);
          if (broken) {
            console.warn(
              "[DevPilot] Cached node_modules is missing node_modules/.bin — repairing with a real install."
            );
            restored = false;
          } else {
            console.info("[DevPilot] Restored node_modules from local cache — no install needed.");
          }
        }
        if (cancelled) return;

        cleanupWatch = watchForInstallCompletion(instance, () => {
          captureAndStoreNodeModules(instance, pkgHash).catch(() => {});
        });

        // Nothing usable cached — either nothing was cached, or a restored
        // bundle failed the integrity check above — and this template
        // actually has dependencies: install automatically instead of
        // leaving the user to type `npm install` themselves. The plain Node
        // starter has none, so it's skipped entirely.
        if (!restored && hasDeclaredDependencies(pkgJson)) {
          const toastId = toast.info("Installing dependencies…");
          const result = await fallbackToNpmInstall(instance, () => {});
          if (cancelled) return;

          if (result.ok) {
            toast.success("Dependencies installed", { id: toastId });
          } else {
            toast.error(
              "Automatic install failed — run npm install manually in the terminal",
              { id: toastId }
            );
          }
        }
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

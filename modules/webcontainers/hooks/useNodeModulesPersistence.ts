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
  tryRestoreFromBlob,
  watchForInstallCompletion,
  captureAndStoreNodeModules,
  uploadNodeModulesToBlob,
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
      // Unique per effect invocation, threaded through every log line below.
      // Purely diagnostic: if the "missing .bin" warning is ever seen firing
      // multiple times in quick succession again, the same id across those
      // lines means one invocation's logs got duplicated somewhere (e.g. a
      // dev-mode log-forwarding artifact); different ids means genuinely
      // concurrent invocations — real evidence either way, not another blind
      // repro attempt.
      const invocationId = Math.random().toString(36).slice(2, 8);

      try {
        const pkgJson = findPackageJsonContent(templateData);
        if (!pkgJson) return;

        const pkgHash = await computePackageJsonHash(pkgJson);
        if (cancelled) return;

        let restoredFrom: "local" | "blob" | null = null;
        if (await tryRestoreNodeModules(instance, pkgHash)) {
          restoredFrom = "local";
        } else if (await tryRestoreFromBlob(instance, pkgHash)) {
          // Level 1 miss, Level 2 (Blob CDN) hit — shared cache populated by
          // some other user's earlier Level 3 install of the same dependency set.
          restoredFrom = "blob";
        }

        let restored = restoredFrom !== null;
        if (restored) {
          // node-modules-persistence.ts's restoreBundleIntoContainer already
          // regenerates node_modules/.bin from each package's package.json#bin
          // field post-restore (the bundle format itself still can't represent
          // symlinks). This check is what catches it if that regeneration
          // didn't fully succeed for some reason, and repairs with a real
          // install rather than serving a broken environment.
          const broken = await checkForPartialInstall(instance);
          if (broken) {
            console.warn(
              `[DevPilot][inv:${invocationId}] Cached node_modules is missing node_modules/.bin — repairing with a real install.`
            );
            restored = false;
          } else {
            console.info(
              `[DevPilot][inv:${invocationId}] ` +
                (restoredFrom === "blob"
                  ? "Restored node_modules from CDN cache (Blob) — no install needed."
                  : "Restored node_modules from local cache — no install needed.")
            );
          }
        }
        if (cancelled) return;

        cleanupWatch = watchForInstallCompletion(instance, () => {
          captureAndStoreNodeModules(instance, pkgHash)
            .then((bundle) => {
              if (bundle) uploadNodeModulesToBlob(pkgHash, bundle);
            })
            .catch(() => {});
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

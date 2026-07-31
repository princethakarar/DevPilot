"use client";

import { useEffect, useRef } from "react";
import type { WebContainer } from "@webcontainer/api";
import { toast } from "sonner";
import type { TemplateFolder, TemplateItem } from "@/modules/playground/lib/path-to-json";
import { fallbackToNpmInstall } from "@/lib/snapshot/loader";
import { checkForPartialInstall } from "@/lib/boot/install-verifier";
import {
  computeDependencyCacheKey,
  tryRestoreNodeModules,
  tryRestoreFromBlob,
  watchForInstallCompletion,
  captureAndStoreNodeModules,
  uploadNodeModulesToBlob,
  type DepCacheProgress,
} from "../lib/node-modules-persistence";
import { depLog, depWarn, depTimer } from "@/lib/dep-cache-debug";
import { DEFAULT_MAXSOCKETS } from "@/lib/boot/npm-flags";

function findFileContent(
  folder: TemplateFolder,
  filename: string,
  fileExtension: string
): string | null {
  for (const item of folder.items as TemplateItem[]) {
    if ("filename" in item) {
      if (item.filename === filename && item.fileExtension === fileExtension) return item.content;
    } else if ("folderName" in item) {
      const nested = findFileContent(item, filename, fileExtension);
      if (nested) return nested;
    }
  }
  return null;
}

function findPackageJsonContent(folder: TemplateFolder): string | null {
  return findFileContent(folder, "package", "json");
}

function findPackageLockContent(folder: TemplateFolder): string | null {
  return findFileContent(folder, "package-lock", "json");
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

        const lockJson = findPackageLockContent(templateData);
        const pkgHash = await computeDependencyCacheKey(pkgJson, lockJson);
        if (cancelled) return;

        depLog("boot: resolved dependency cache key", {
          pkgHash: pkgHash.slice(0, 12),
          keyedOn: lockJson ? "package.json + package-lock.json" : "package.json only",
        });

        // Surfaced through the same toast the auto-install uses, so a large
        // tree visibly counts files instead of sitting on one static message
        // for minutes. Throttled to whole percent changes — the nextjs starter
        // fires this ~1,100 times during a restore.
        let lastPct = -1;
        let progressToastId: string | number | undefined;
        const onProgress = (p: DepCacheProgress) => {
          if (cancelled || p.total === 0) return;
          const pct = Math.floor((p.completed / p.total) * 100);
          if (pct === lastPct) return;
          lastPct = pct;
          progressToastId = toast.loading(`${p.message} (${pct}%)`, { id: progressToastId });
        };
        const dismissProgress = () => {
          if (progressToastId !== undefined) toast.dismiss(progressToastId);
          progressToastId = undefined;
          lastPct = -1;
        };

        let restoredFrom: "local" | "blob" | null = null;
        if (await tryRestoreNodeModules(instance, pkgHash, onProgress)) {
          restoredFrom = "local";
        } else if (await tryRestoreFromBlob(instance, pkgHash, onProgress)) {
          // Level 1 miss, Level 2 (Blob CDN) hit — shared cache populated by
          // some other user's earlier Level 3 install of the same dependency set.
          restoredFrom = "blob";
        }
        dismissProgress();

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

        // Only arm the capture watcher when this boot could actually produce
        // something worth caching — i.e. when we're about to run a real
        // install.
        //
        // Previously it was armed unconditionally, so a SUCCESSFUL restore
        // immediately tripped its own watcher (restoring writes thousands of
        // files under node_modules): the tree got re-walked, re-gzipped and
        // re-uploaded on every single warm boot, only for the upload to be
        // correctly rejected by the route's write-gate for still being within
        // MAX_AGE_MS. Pure waste — hundreds of MB of work per boot to
        // reproduce a bundle that was already there.
        if (!restored) {
          cleanupWatch = watchForInstallCompletion(instance, () => {
            captureAndStoreNodeModules(instance, pkgHash, pkgJson, onProgress)
              .then((bundle) => {
                dismissProgress();
                if (bundle) return uploadNodeModulesToBlob(pkgHash, bundle, onProgress);
                return false;
              })
              .then(() => dismissProgress())
              .catch((err) => {
                dismissProgress();
                depWarn("post-install capture failed (non-fatal):", err);
              });
          });
        }

        // Nothing usable cached — either nothing was cached, or a restored
        // bundle failed the integrity check above — and this template
        // actually has dependencies: install automatically instead of
        // leaving the user to type `npm install` themselves. The plain Node
        // starter has none, so it's skipped entirely.
        if (!restored && hasDeclaredDependencies(pkgJson)) {
          const toastId = toast.loading("Installing dependencies…");
          // Timed permanently (behind the debug flag) rather than measured
          // ad-hoc: "how long does a cold npm install actually take in the
          // sandbox" is the single number this whole cache exists to reduce,
          // and it was previously not recorded anywhere.
          const installDone = depTimer(
            `L3 npm install (cold) — maxsockets=${DEFAULT_MAXSOCKETS}`
          );
          const result = await fallbackToNpmInstall(instance, (progress) => {
            if (cancelled) return;
            // npm's own output is the only progress signal available during
            // the install phase; surface its last line rather than a static
            // message so a long nextjs install doesn't look frozen.
            if (progress.phase === "installing" && progress.message) {
              toast.loading(progress.message.slice(0, 120), { id: toastId });
            }
          });
          installDone({ ok: result.ok });
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

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

import type { TemplateFolder } from "../lib/path-to-json";
import { getPlaygroundById, SaveUpdatedCode } from "../actions";
import { getPlaygroundEnvVars, setPlaygroundEnvVars } from "../actions/env";
import { findEnvFile, injectEnvFile, parseEnvContent, serializeEnvContent, stripEnvFile } from "../lib/env-merge";

interface PlaygroundData {
  id: string;
  title?: string;
  [key: string]: any;
}

interface UsePlaygroundReturn {
  playgroundData: PlaygroundData | null;
  templateData: TemplateFolder | null;
  isLoading: boolean;
  error: string | null;
  loadPlayground: () => Promise<void>;
  saveTemplateData: (data: TemplateFolder) => Promise<void>;
  /**
   * Same fetch-and-apply as loadPlayground, but never touches `isLoading`/`error`
   * — those gate whether page.tsx renders <IdeLayout> at all (see the full-screen
   * "Initializing Env" branch), so toggling them unmounts the whole IDE (terminal,
   * preview, editor, agent panel) for the duration of the fetch. Use this for a
   * background refresh after something finishes in place (e.g. an agent run
   * ending, a repo getting linked) where the user is actively looking at a live
   * WebContainer/terminal/SSE connection that a remount would silently kill.
   */
  refreshTemplateData: () => Promise<void>;
}

export const usePlayground = (id: string): UsePlaygroundReturn => {
  const [playgroundData, setPlaygroundData] = useState<PlaygroundData | null>(
    null
  );
  const [templateData, setTemplateData] = useState<TemplateFolder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tracks whether this playground currently has any rows in PlaygroundEnvVar,
  // so saveTemplateData knows whether an incoming save with no ".env" file
  // means "never had one" (nothing to do) vs. "user just deleted/emptied it"
  // (clear the stored rows too, instead of leaving them to reappear on reload).
  const hasStoredEnvVars = useRef(false);

  // Merges this playground's out-of-band env vars (see PlaygroundEnvVar) back
  // into the loaded tree as a synthesized ".env" file, so the editor/explorer/
  // WebContainer mount all see it exactly as if it were a normal file — while
  // the durable copy in Mongo (and anything pushed to GitHub) never contains
  // the raw secret text. A playground with no PlaygroundEnvVar rows yet (never
  // migrated, or genuinely has none) is returned untouched.
  //
  // `storedPath` is the folder the file lived in last time it was saved
  // (Playground.envFilePath). The loaded tree itself never contains ".env"
  // (saveTemplateData always strips it before persisting), so `findEnvFile`
  // on `data` can never recover the original location — using it as the
  // source of truth here previously caused every reload to silently re-inject
  // ".env" at the tree root, even when it had been created in a subdirectory.
  const mergeEnvVars = useCallback(async (data: TemplateFolder, storedPath?: string[] | null): Promise<TemplateFolder> => {
    const vars = await getPlaygroundEnvVars(id);
    hasStoredEnvVars.current = vars.length > 0;
    if (vars.length === 0) return data;

    const path = storedPath ?? findEnvFile(data)?.path ?? [];
    return injectEnvFile(data, path, serializeEnvContent(vars));
  }, [id]);

  // `background` = true skips the isLoading/error toggles that gate whether
  // page.tsx renders <IdeLayout> at all — see refreshTemplateData's doc comment.
  const fetchAndApply = useCallback(async (background: boolean) => {
    if (!id || id === "undefined") return;

    try {
      if (!background) {
        setIsLoading(true);
        setError(null);
      }

      const data = await getPlaygroundById(id);

      //   @ts-ignore
      setPlaygroundData(data);
      const rawContent = data?.templateFiles?.[0]?.content;

      if (typeof rawContent === "string") {
        const parsedContent = JSON.parse(rawContent);
        setTemplateData(await mergeEnvVars(parsedContent, data?.envFilePath));
        if (!background) toast.success("playground loaded successfully");
        return;
      }

      //   load template from api if not in saved content

      const res = await fetch(`/api/template/${id}`);

      if (!res.ok) throw new Error(`Failed to load template: ${res.status}`);

      const templateRes = await res.json();

      let freshData: TemplateFolder;
      if (templateRes.templateJson && Array.isArray(templateRes.templateJson)) {
        freshData = {
          folderName: "Root",
          items: templateRes.templateJson,
        };
      } else {
        freshData = templateRes.templateJson || {
          folderName: "Root",
          items: [],
        };
      }
      setTemplateData(await mergeEnvVars(freshData, data?.envFilePath));
      if (!background) toast.success("Template loaded successfully");
    } catch (error) {
      console.error("Error loading playground:", error);
      if (!background) {
        setError("Failed to load playground data");
        toast.error("Failed to load playground data");
      } else {
        // Never set `error` here — that also gates <IdeLayout>'s render, which
        // would unmount the live IDE over a background refresh failing.
        toast.error("Failed to refresh project data — showing last known state.");
      }
    } finally {
      if (!background) setIsLoading(false);
    }
  }, [id, mergeEnvVars]);

  const loadPlayground = useCallback(() => fetchAndApply(false), [fetchAndApply]);
  const refreshTemplateData = useCallback(() => fetchAndApply(true), [fetchAndApply]);



  const saveTemplateData = useCallback(async(data:TemplateFolder)=>{
    if (!id || id === "undefined") return;
    try {
      const envFile = findEnvFile(data);
      let treeToPersist = data;

      if (envFile) {
        const vars = parseEnvContent(envFile.content);
        // Persist the folder it lives in alongside the vars — the tree we're
        // about to save never contains ".env" itself (stripped below), so
        // this is the only record of its location for the next reload.
        await setPlaygroundEnvVars(id, vars, envFile.path);
        hasStoredEnvVars.current = vars.length > 0;
        treeToPersist = stripEnvFile(data);
      } else if (hasStoredEnvVars.current) {
        // .env was deleted/emptied in this save — clear the stored rows too,
        // instead of leaving them to silently reappear on the next reload.
        await setPlaygroundEnvVars(id, []);
        hasStoredEnvVars.current = false;
      }

      await SaveUpdatedCode(id, treeToPersist);
      setTemplateData(data);
      // No success toast here — callers show their own contextual toast (or
      // stay silent for autosave); this fires far too often once autosave is on.
    } catch (error) {
         console.error("Error saving template data:", error);
      toast.error("Failed to save changes");
      throw error;
    }
  },[id])


  useEffect(()=>{
    loadPlayground()
  },[loadPlayground])

    return {
    playgroundData,
    templateData,
    isLoading,
    error,
    loadPlayground,
    saveTemplateData,
    refreshTemplateData,
  };
};
  
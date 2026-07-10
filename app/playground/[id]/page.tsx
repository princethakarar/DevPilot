// @ts-nocheck
"use client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import LoadingStep from "@/modules/playground/components/loader";
import {
  TemplateFile,
  TemplateFolder,
  TemplateItem,
} from "@/modules/playground/lib/path-to-json";
import { TemplateFileTree } from "@/modules/playground/components/playground-explorer";
import { useAISuggestions } from "@/modules/playground/hooks/useAISuggestion";

import { useFileExplorer } from "@/modules/playground/hooks/useFileExplorer";
import { usePlayground } from "@/modules/playground/hooks/usePlayground";
import { getFileDisplayName, updateFileContentAtPath } from "@/modules/playground/lib";
import { IdeLayout } from "@/modules/webcontainers/components/ide-layout";
import { useWebContainer } from "@/modules/webcontainers/hooks/useWebContainer";
import { transformToWebContainerFormat } from "@/modules/webcontainers/hooks/transformer";
import {
  AlertCircle,
  FolderOpen,
} from "lucide-react";
import { SourceControlPanel } from "@/modules/playground/components/source-control-panel";
import { useSourceControl } from "@/modules/playground/hooks/useSourceControl";
import { useNodeModulesPersistence } from "@/modules/webcontainers/hooks/useNodeModulesPersistence";
import { useIdeLayout } from "@/modules/webcontainers/hooks/useIdeLayout";
import { useParams } from "next/navigation";
import React, {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

const MainPlaygroundPage = () => {
  const { id } = useParams<{ id: string }>();
  const [isPreviewVisible, setIsPreviewVisible] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [highlightCurrentLine, setHighlightCurrentLine] = useState(true);

  const { playgroundData, templateData, isLoading, error, saveTemplateData } =
    usePlayground(id);

    const aiSuggestions = useAISuggestions();

  const {
    setTemplateData,
    setActiveFileId,
    setPlaygroundId,
    setOpenFiles,
    activeFileId,
    closeAllFiles,
    closeFile,
    openFile,
    openFiles,

    handleAddFile,
    handleAddFolder,
    handleDeleteFile,
    handleDeleteFolder,
    handleRenameFile,
    handleRenameFolder,
    updateFileContent
  } = useFileExplorer();

  const {
    serverUrl,
    isLoading: containerLoading,
    error: containerError,
    instance,
    writeFileSync,
  } = useWebContainer();

  const lastSyncedContent = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    setPlaygroundId(id);
  }, [id, setPlaygroundId]);

  // The preview URL lives in a global store, and the WebContainer instance
  // itself is cached across playgrounds in the same tab (see useWebContainer.ts).
  // Without this, opening a new playground while a previous one's dev server
  // was still running left its stale preview URL on screen — this project's
  // preview showing another project's app. Clear it the moment this
  // playground's id changes, so preview stays blank until THIS project's own
  // server-ready fires.
  useEffect(() => {
    useIdeLayout.getState().setDetectedServerUrl(null);
  }, [id]);

  useEffect(() => {
    if (templateData) {
      setTemplateData(templateData);
    }
  }, [templateData, setTemplateData]);

  const hasMounted = useRef(false);
  const [filesMounted, setFilesMounted] = useState(false);
  useEffect(() => {
    if (instance && templateData && !hasMounted.current) {
      hasMounted.current = true;
      const files = transformToWebContainerFormat(templateData);
      instance.mount(files).then(async () => {
        console.log("Initial files mounted to WebContainer");

        // Speed up whatever `npm install` the user runs in the terminal: skip
        // the audit/funding network round-trips and progress-bar I/O, without
        // touching concurrency (that's tuned for stability elsewhere, not
        // speed — see AGENTS.md's Boot Reliability System notes on maxsockets).
        // Only written if the project doesn't already ship its own .npmrc.
        try {
          await instance.fs.readFile("/.npmrc", "utf-8");
        } catch {
          try {
            await instance.fs.writeFile(
              "/.npmrc",
              ["audit=false", "fund=false", "progress=false", "prefer-offline=true"].join("\n")
            );
          } catch {
            // Non-fatal — worst case installs just use npm's defaults.
          }
        }

        setFilesMounted(true);
      });
    }
  }, [instance, templateData]);

  // Wait until the project's own files are mounted before attempting to restore
  // a cached node_modules snapshot, so it doesn't race WebContainer's own mount().
  useNodeModulesPersistence(instance, id, filesMounted ? templateData : null);

  // Single source of truth for Source Control's changed-file state — both the
  // rail badge and the panel's list read from this store, refreshed here
  // whenever the tree changes (i.e. after any save), so the badge stays live
  // even while the Source Control panel itself isn't open.
  const hasGithubRepo = !!(playgroundData?.githubRepo && playgroundData?.githubBranch);
  useEffect(() => {
    useSourceControl.getState().setHasGithubRepo(hasGithubRepo);
    useSourceControl.getState().refreshChanges(id);
  }, [id, hasGithubRepo, templateData]);

  // Create wrapper functions that pass saveTemplateData
  const wrappedHandleAddFile = useCallback(
    (newFile: TemplateFile, parentPath: string) => {
      return handleAddFile(
        newFile,
        parentPath,
        writeFileSync,
        instance,
        saveTemplateData
      );
    },
    [handleAddFile, writeFileSync, instance, saveTemplateData]
  );

  const wrappedHandleAddFolder = useCallback(
    (newFolder: TemplateFolder, parentPath: string) => {
      return handleAddFolder(newFolder, parentPath, instance, saveTemplateData);
    },
    [handleAddFolder, instance, saveTemplateData]
  );

  const wrappedHandleDeleteFile = useCallback(
    (file: TemplateFile, parentPath: string) => {
      return handleDeleteFile(file, parentPath, saveTemplateData);
    },
    [handleDeleteFile, saveTemplateData]
  );

  const wrappedHandleDeleteFolder = useCallback(
    (folder: TemplateFolder, parentPath: string) => {
      return handleDeleteFolder(folder, parentPath, saveTemplateData);
    },
    [handleDeleteFolder, saveTemplateData]
  );

  const wrappedHandleRenameFile = useCallback(
    (
      file: TemplateFile,
      newFilename: string,
      newExtension: string,
      parentPath: string
    ) => {
      return handleRenameFile(
        file,
        newFilename,
        newExtension,
        parentPath,
        saveTemplateData
      );
    },
    [handleRenameFile, saveTemplateData]
  );

  const wrappedHandleRenameFolder = useCallback(
    (folder: TemplateFolder, newFolderName: string, parentPath: string) => {
      return handleRenameFolder(
        folder,
        newFolderName,
        parentPath,
        saveTemplateData
      );
    },
    [handleRenameFolder, saveTemplateData]
  );

  const handleSyncFromTerminal = useCallback(async () => {
    if (!instance || !templateData) {
      toast.error("WebContainer or template data not ready");
      return;
    }

    try {
      const ignoredFolders = new Set(["node_modules", ".next", ".git"]);
      
      const readDirectory = async (dirPath: string): Promise<TemplateItem[]> => {
        const items: TemplateItem[] = [];
        const entries = await instance.fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (ignoredFolders.has(entry.name)) continue;
          
          const fullPath = dirPath === "" ? entry.name : `${dirPath}/${entry.name}`;
          
          if (entry.isDirectory()) {
            const children = await readDirectory(fullPath);
            items.push({
              folderName: entry.name,
              items: children
            });
          } else if (entry.isFile()) {
            try {
              const content = await instance.fs.readFile(fullPath, "utf-8");
              const lastDotIndex = entry.name.lastIndexOf('.');
              const filename = lastDotIndex !== -1 ? entry.name.slice(0, lastDotIndex) : entry.name;
              const fileExtension = lastDotIndex !== -1 ? entry.name.slice(lastDotIndex + 1) : "";
              
              items.push({
                filename,
                fileExtension,
                content
              });
            } catch (e) {
              console.warn(`Skipping binary or unreadable file: ${fullPath}`);
            }
          }
        }
        return items;
      };

      toast.info("Syncing files from terminal...");
      const rootItems = await readDirectory("");
      
      const newTemplateData: TemplateFolder = {
        folderName: "Root",
        items: rootItems
      };

      const updated = await saveTemplateData(newTemplateData);
      setTemplateData(updated || newTemplateData);
      toast.success("Files synced successfully!");
    } catch (error) {
      console.error("Failed to sync from terminal:", error);
      toast.error("Failed to sync files from terminal");
    }
  }, [instance, templateData, saveTemplateData, setTemplateData]);

  const activeFile = openFiles.find((file) => file.id === activeFileId);
  const hasUnsavedChanges = openFiles.some((file) => file.hasUnsavedChanges);

  const handleFileSelect = (file: TemplateFile, parentPath: string) => {
    openFile(file, parentPath);
  };

  // Saves one or more open files: writes each straight to the WebContainer FS
  // (fast, local — no deep clone of the whole tree) and only then does the one
  // expensive part, the full-tree DB persist, exactly ONCE for the whole batch.
  // Previously each file's save deep-cloned + rewrote the entire project tree
  // AND fired its own separate DB upsert of the whole tree, which is why saving
  // multiple dirty files (e.g. handleSaveAll) could race — concurrent upserts
  // built from slightly-stale snapshots could silently clobber each other.
  //
  // Filenames are matched by each open file's own `id` (its exact path), not by
  // name alone — fixes content silently landing in the wrong file whenever two
  // files share a name in different folders (a real, reproducible failure mode
  // for dotfiles like ".env", which projects commonly duplicate per-package).
  const saveFiles = useCallback(
    async (fileIds?: string[], options?: { silent?: boolean }) => {
      const latestOpenFiles = useFileExplorer.getState().openFiles;
      const targetIds =
        fileIds ?? latestOpenFiles.filter((f) => f.hasUnsavedChanges).map((f) => f.id);
      if (targetIds.length === 0) return;

      let workingTemplateData = useFileExplorer.getState().templateData;
      if (!workingTemplateData) return;

      const savedFiles: typeof latestOpenFiles = [];

      for (const fid of targetIds) {
        const file = latestOpenFiles.find((f) => f.id === fid);
        if (!file || !file.hasUnsavedChanges) continue;

        try {
          if (writeFileSync) {
            await writeFileSync(file.id, file.content);
            lastSyncedContent.current.set(file.id, file.content);
          }
          workingTemplateData = updateFileContentAtPath(workingTemplateData, file.id, file.content);
          savedFiles.push(file);
        } catch (error) {
          console.error("Error saving file:", error);
          toast.error(`Failed to save ${getFileDisplayName(file.filename, file.fileExtension)}`);
        }
      }

      if (savedFiles.length === 0) return;

      const savedIds = new Set(savedFiles.map((f) => f.id));
      setOpenFiles(
        useFileExplorer.getState().openFiles.map((f) =>
          savedIds.has(f.id) ? { ...f, originalContent: f.content, hasUnsavedChanges: false } : f
        )
      );
      setTemplateData(workingTemplateData);

      try {
        // saveTemplateData's own resolved value is always undefined (it never
        // returns the row) — it updates its own internal state as a side effect.
        await saveTemplateData(workingTemplateData);
        if (!options?.silent) {
          toast.success(
            savedFiles.length === 1
              ? `Saved ${getFileDisplayName(savedFiles[0].filename, savedFiles[0].fileExtension)}`
              : `Saved ${savedFiles.length} files`
          );
        }
      } catch (error) {
        // usePlayground's saveTemplateData already surfaces its own error toast.
        console.error("Error persisting to database:", error);
      }
    },
    [writeFileSync, setOpenFiles, setTemplateData, saveTemplateData]
  );

  // Auto-save: debounce ~1s after the last edit anywhere, then flush every
  // dirty file in a single batch (see saveFiles). Resets on every keystroke via
  // the openFiles dependency, so it only actually fires once things go quiet.
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const anyDirty = openFiles.some((f) => f.hasUnsavedChanges);
    if (!anyDirty) return;

    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      saveFiles(undefined, { silent: true });
    }, 1000);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [openFiles, saveFiles]);

  // Manual save (Ctrl+S) is an immediate, forced save of just the active file.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        if (activeFileId) saveFiles([activeFileId]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFileId, saveFiles]);

  // Flush a specific file immediately (used before switching away from it or
  // closing it) so unsaved edits are never silently lost.
  const flushFileIfDirty = useCallback(
    (fileId: string | null) => {
      if (!fileId) return;
      const file = useFileExplorer.getState().openFiles.find((f) => f.id === fileId);
      if (file?.hasUnsavedChanges) saveFiles([fileId], { silent: true });
    },
    [saveFiles]
  );

  // Guard: id not yet resolved from route params or invalid placeholder
  if (!id || id === "undefined" || id === "ready") {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-full bg-[#080C18]">
        <div className="w-full max-w-sm bg-[#0D1221] border border-[#1E2D45] rounded-lg p-6">
          <div className="flex items-center gap-3">
            <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#1E2D45] border-t-[#38BDF8]" />
            <h2 className="text-[13px] font-semibold text-[#E2EAF4] uppercase tracking-[0.1em] font-sans">Loading Playground...</h2>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] p-4">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-red-600 mb-2">
          Something went wrong
        </h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <Button onClick={() => window.location.reload()} variant="destructive">
          Try Again
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-full bg-[#080C18] p-4">
        <div className="w-full max-w-sm bg-[#0D1221] border border-[#1E2D45] rounded-lg p-6 shadow-[0_0_24px_rgba(56,189,248,0.06)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex items-center justify-center w-5 h-5">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-[#1E2D45] border-t-[#38BDF8]"></span>
            </div>
            <h2 className="text-[13px] font-semibold tracking-[0.1em] text-[#E2EAF4] uppercase font-sans">
              Initializing Env
            </h2>
          </div>
          <div className="space-y-4">
            <LoadingStep
              currentStep={1}
              step={1}
              label="Loading playground data"
            />
            <LoadingStep
              currentStep={2}
              step={2}
              label="Setting up environment"
            />
            <LoadingStep currentStep={3} step={3} label="Ready to code" />
          </div>
        </div>
      </div>
    );
  }

  // No template data
  if (!templateData) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] p-4">
        <FolderOpen className="h-12 w-12 text-amber-500 mb-4" />
        <h2 className="text-xl font-semibold text-amber-600 mb-2">
          No template data available
        </h2>
        <Button onClick={() => window.location.reload()} variant="outline">
          Reload Template
        </Button>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <IdeLayout
        instance={instance}
        projectName={playgroundData?.title || "Playground"}
        onBeforeFileSelect={flushFileIfDirty}
        onBeforeFileClose={flushFileIfDirty}
        sourceControlContent={
          <SourceControlPanel
            playgroundId={id}
            githubRepo={playgroundData?.githubRepo}
            githubBranch={playgroundData?.githubBranch}
            instance={instance}
            writeFileSync={writeFileSync}
          />
        }
        explorerContent={
          <TemplateFileTree
            data={templateData}
            onFileSelect={handleFileSelect}
            selectedFile={activeFile}
            title={playgroundData?.title || "Explorer"}
            onAddFile={wrappedHandleAddFile}
            onAddFolder={wrappedHandleAddFolder}
            onDeleteFile={wrappedHandleDeleteFile}
            onDeleteFolder={wrappedHandleDeleteFolder}
            onRenameFile={wrappedHandleRenameFile}
            onRenameFolder={wrappedHandleRenameFolder}
            onRefresh={handleSyncFromTerminal}
          />
        }
      />
    </TooltipProvider>
  );
};

export default MainPlaygroundPage;

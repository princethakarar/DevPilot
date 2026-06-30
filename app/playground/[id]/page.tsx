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
import { findFilePath } from "@/modules/playground/lib";
import { IdeLayout } from "@/modules/webcontainers/components/ide-layout";
import { useWebContainer } from "@/modules/webcontainers/hooks/useWebContainer";
import { transformToWebContainerFormat } from "@/modules/webcontainers/hooks/transformer";
import {
  AlertCircle,
  FolderOpen,
} from "lucide-react";
import CommitDialog from "@/modules/playground/components/dialogs/commit-dialog";
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
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
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

  useEffect(() => {
    if (templateData) {
      setTemplateData(templateData);
    }
  }, [templateData, setTemplateData]);

  const hasMounted = useRef(false);
  useEffect(() => {
    if (instance && templateData && !hasMounted.current) {
      hasMounted.current = true;
      const files = transformToWebContainerFormat(templateData);
      instance.mount(files).then(() => {
        console.log("Initial files mounted to WebContainer");
      });
    }
  }, [instance, templateData]);

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

  const handleFileSelect = (file: TemplateFile) => {
    openFile(file);
  };

  const handleSave = useCallback(
    async (fileId?: string) => {
      const targetFileId = fileId || activeFileId;
      if (!targetFileId) return;

      const fileToSave = openFiles.find((f) => f.id === targetFileId);

      if (!fileToSave) return;

      const latestTemplateData = useFileExplorer.getState().templateData;
      if (!latestTemplateData) return

      try {
            const filePath = findFilePath(fileToSave, latestTemplateData);
        if (!filePath) {
          toast.error(
            `Could not find path for file: ${fileToSave.filename}.${fileToSave.fileExtension}`
          );
          return;
        }

   const updatedTemplateData = JSON.parse(
          JSON.stringify(latestTemplateData)
        );

        // @ts-ignore
          const updateFileContent = (items: any[]) =>
            // @ts-ignore
          items.map((item) => {
            if ("folderName" in item) {
              return { ...item, items: updateFileContent(item.items) };
            } else if (
              item.filename === fileToSave.filename &&
              item.fileExtension === fileToSave.fileExtension
            ) {
              return { ...item, content: fileToSave.content };
            }
            return item;
          });
        updatedTemplateData.items = updateFileContent(
          updatedTemplateData.items
        );

          // Sync with WebContainer
        if (writeFileSync) {
          await writeFileSync(filePath, fileToSave.content);
          lastSyncedContent.current.set(fileToSave.id, fileToSave.content);
          if (instance && instance.fs) {
            await instance.fs.writeFile(filePath, fileToSave.content);
          }
        }

           const newTemplateData = await saveTemplateData(updatedTemplateData);
        setTemplateData(newTemplateData || updatedTemplateData);
// Update open files
        const updatedOpenFiles = openFiles.map((f) =>
          f.id === targetFileId
            ? {
                ...f,
                content: fileToSave.content,
                originalContent: fileToSave.content,
                hasUnsavedChanges: false,
              }
            : f
        );
        setOpenFiles(updatedOpenFiles);

    toast.success(
          `Saved ${fileToSave.filename}.${fileToSave.fileExtension}`
        );
      } catch (error) {
         console.error("Error saving file:", error);
        toast.error(
          `Failed to save ${fileToSave.filename}.${fileToSave.fileExtension}`
        );
        throw error;
      }
    },
    [
      activeFileId,
      openFiles,
      writeFileSync,
      instance,
      saveTemplateData,
      setTemplateData,
      setOpenFiles,
    ]
  );

    const handleSaveAll = async () => {
    const unsavedFiles = openFiles.filter((f) => f.hasUnsavedChanges);

    if (unsavedFiles.length === 0) {
      toast.info("No unsaved changes");
      return;
    }

    try {
      await Promise.all(unsavedFiles.map((f) => handleSave(f.id)));
      toast.success(`Saved ${unsavedFiles.length} file(s)`);
    } catch (error) {
      toast.error("Failed to save some files");
    }
  };


  useEffect(()=>{
    const handleKeyDown = (e:KeyboardEvent)=>{
      if(e.ctrlKey && e.key === "s"){
        e.preventDefault()
        handleSave()
      }
    }
     window.addEventListener("keydown", handleKeyDown);
     return () => window.removeEventListener("keydown", handleKeyDown);
  },[handleSave]);

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
        explorerContent={
          <TemplateFileTree
            data={templateData}
            onFileSelect={handleFileSelect}
            selectedFile={activeFile}
            title="File Explorer"
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
      {playgroundData?.githubRepo && playgroundData?.githubBranch && (
        <CommitDialog
          isOpen={isCommitDialogOpen}
          onClose={() => setIsCommitDialogOpen(false)}
          playgroundId={id}
          githubRepo={playgroundData.githubRepo}
          githubBranch={playgroundData.githubBranch}
        />
      )}
    </TooltipProvider>
  );
};

export default MainPlaygroundPage;

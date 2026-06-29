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
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import LoadingStep from "@/modules/playground/components/loader";
import {PlaygroundEditor} from "@/modules/playground/components/playground-editor";
import { TemplateFileTree } from "@/modules/playground/components/playground-explorer";
import ToggleAI from "@/modules/playground/components/toggle-ai";
import { useAISuggestions } from "@/modules/playground/hooks/useAISuggestion";
import { AIChatSidePanel } from "@/modules/ai-chat/components/ai-chat-sidebarpanel";
import { useFileExplorer } from "@/modules/playground/hooks/useFileExplorer";
import { usePlayground } from "@/modules/playground/hooks/usePlayground";
import { findFilePath } from "@/modules/playground/lib";
import {
  TemplateFile,
  TemplateFolder,
  TemplateItem,
} from "@/modules/playground/lib/path-to-json";
import WebContainerPreview from "@/modules/webcontainers/components/webcontainer-preview";
import { useWebContainer } from "@/modules/webcontainers/hooks/useWebContainer";
import {
  AlertCircle,
  Bot,
  FileText,
  FolderOpen,
  Save,
  Settings,
  X,
  GitBranch,
  GitCommit,
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
      <>
        <TemplateFileTree
          data={templateData!}
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
        <SidebarInset className="relative flex flex-col bg-[#080C18] text-[#E2EAF4] border-l border-[#1E2D45]">
          {/* Subtle grid background and glowing ambient orbs */}
          <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(56,189,248,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(56,189,248,0.02)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#1D6FA4]/5 rounded-full blur-[120px]" />
          </div>
 
          <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[#1E2D45] px-6 bg-[#080C18]">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-8 w-8 rounded-lg text-[#A5B8CC] hover:text-[#38BDF8] bg-transparent border-none transition-colors duration-200 cursor-pointer" />
              <Separator orientation="vertical" className="h-4 bg-[#1E2D45]" />
 
              <div className="flex flex-col">
                <h1 className="text-xs font-semibold text-[#E2EAF4] tracking-wide flex items-center gap-1.5 font-sans">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] shadow-[0_0_8px_#38BDF8]" />
                  {playgroundData?.title || "Code Playground"}
                </h1>
                <p className="text-[10px] text-[#CBD5E1] font-sans">
                  {openFiles.length} File(s) open {hasUnsavedChanges && "• Unsaved changes"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 relative z-20">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleSave()}
                    disabled={!activeFile || !activeFile.hasUnsavedChanges}
                    className="h-8 px-3 rounded-none text-xs font-medium font-sans border border-[#1E2D45] text-[#CBD5E1] hover:border-[#2A4A7F] hover:text-[#38BDF8] disabled:opacity-30 transition-all duration-200 cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" /> Save
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#0D1221] border border-[#1E2D45] text-[#E2EAF4] font-sans text-xs">Save (Ctrl+S)</TooltipContent>
              </Tooltip>
 
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSaveAll}
                    disabled={!hasUnsavedChanges}
                    className="h-8 px-3 rounded-none text-xs font-medium font-sans border border-[#1E2D45] text-[#CBD5E1] hover:border-[#2A4A7F] hover:text-[#38BDF8] disabled:opacity-30 transition-all duration-200 cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" /> Save All
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#0D1221] border border-[#1E2D45] text-[#E2EAF4] font-sans text-xs">Save All (Ctrl+Shift+S)</TooltipContent>
              </Tooltip>

              {playgroundData?.githubRepo && playgroundData?.githubBranch && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsCommitDialogOpen(true)}
                      className="h-8 px-3 rounded-lg text-xs font-semibold font-jetbrains border border-[rgba(168,85,247,0.15)] bg-[#8B5CF6]/5 hover:bg-[#8B5CF6]/15 text-[#a67bd4] transition-all duration-300 cursor-pointer"
                    >
                      <GitBranch className="h-3.5 w-3.5 mr-1.5" /> Sync with GitHub
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#071428] border border-[rgba(168,85,247,0.25)] text-[#e8f4ff] font-jetbrains text-xs">
                    Commit & Push Changes
                  </TooltipContent>
                </Tooltip>
              )}

              <ToggleAI
                isEnabled={aiSuggestions.isEnabled}
                onToggle={aiSuggestions.toggleEnabled}
                suggestionLoading={aiSuggestions.isLoading}
                isChatOpen={isChatOpen}
                onToggleChat={setIsChatOpen}
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 rounded-none border border-[#1E2D45] text-[#CBD5E1] hover:text-[#38BDF8] hover:border-[#2A4A7F] transition-all cursor-pointer">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-[#0D1221] border border-[#1E2D45] text-[#E2EAF4] rounded-lg shadow-2xl p-1">
                  <DropdownMenuItem
                    onClick={() => setIsPreviewVisible(!isPreviewVisible)}
                    className="flex items-center gap-2 px-3 py-2 text-xs rounded-md hover:bg-[#1A2236] cursor-pointer transition-colors focus:bg-[#1A2236] focus:text-[#38BDF8]"
                  >
                    {isPreviewVisible ? "Hide" : "Show"} Preview Panel
                  </DropdownMenuItem>
                  <DropdownMenuCheckboxItem
                    checked={highlightCurrentLine}
                    onCheckedChange={setHighlightCurrentLine}
                    className="flex items-center gap-2 px-3 py-2 text-xs rounded-md hover:bg-[#1A2236] text-[#E2EAF4] cursor-pointer transition-colors focus:bg-[#1A2236] focus:text-[#38BDF8] data-[state=checked]:text-[#38BDF8]"
                  >
                    Highlight Active Line
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator className="bg-[#1E2D45]" />
                  <DropdownMenuItem onClick={closeAllFiles} className="flex items-center gap-2 px-3 py-2 text-xs rounded-md hover:bg-rose-500/10 text-rose-400 cursor-pointer transition-colors focus:bg-rose-500/10 focus:text-rose-400">
                    Close All Files
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <div className="relative z-10 flex-1 flex flex-col min-h-0">
            {isChatOpen ? (
              <AIChatSidePanel
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
              />
            ) : (
              <>
                <div className="h-full flex flex-col">
                  {openFiles.length > 0 && (
                    <div className="border-b border-[#1E2D45] bg-[#080C18] px-4 pt-2">
                      <Tabs
                        value={activeFileId || ""}
                        onValueChange={setActiveFileId}
                        className="w-full"
                      >
                        <div className="flex items-center justify-between">
                          <TabsList className="h-10 bg-transparent p-0 flex gap-1 items-end">
                            {openFiles.map((file) => {
                              const isActive = file.id === activeFileId;
                              return (
                                <TabsTrigger
                                  key={file.id}
                                  value={file.id}
                                  style={isActive ? { boxShadow: "inset 0 1px 0 #38BDF8" } : undefined}
                                  className={cn(
                                    "relative h-9 px-4 rounded-t-lg rounded-b-none transition-all duration-200 cursor-pointer font-sans text-xs flex items-center gap-2 border-x border-t outline-none group/tab",
                                    isActive
                                      ? "bg-[#0D1221] text-[#E2EAF4] border-[#1E2D45] border-b-transparent z-10"
                                      : "bg-transparent text-[#CBD5E1] border-transparent hover:text-[#E2EAF4]"
                                  )}
                                >
                                  <FileText className={cn("h-3.5 w-3.5", isActive ? "text-[#38BDF8]" : "text-[#CBD5E1]")} />
                                  <span>
                                    {file.filename}.{file.fileExtension}
                                  </span>
                                  {file.hasUnsavedChanges && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                                  )}
                                  <span
                                    className="ml-2 h-4 w-4 hover:bg-[#1A2236] rounded flex items-center justify-center transition-all cursor-pointer opacity-0 group-hover/tab:opacity-100 text-[#6B8CAE]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      closeFile(file.id);
                                    }}
                                  >
                                    <X className="size-3" />
                                  </span>
                                </TabsTrigger>
                              );
                            })}
                          </TabsList>
 
                          {openFiles.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={closeAllFiles}
                              className="h-7 px-3 text-xs font-medium rounded-none border border-[#1E2D45] text-[#6B8CAE] hover:text-[#38BDF8] hover:border-[#2A4A7F] transition-all cursor-pointer"
                            >
                              Close All
                            </Button>
                          )}
                        </div>
                      </Tabs>
                    </div>
                  )}
                  <div className="flex-1 bg-[rgba(2,11,31,0.2)]">
                      <ResizablePanelGroup
                        direction="horizontal"
                        className="h-full"
                      >
                        <ResizablePanel defaultSize={isPreviewVisible ? 50 : 100} className="relative">
                          {openFiles.length > 0 ? (
                            <PlaygroundEditor
                              activeFile={activeFile}
                              content={activeFile?.content || ""}
                              onContentChange={(value) => 
                                activeFileId && updateFileContent(activeFileId , value)
                              }
                              suggestion={aiSuggestions.suggestion}
                              suggestionLoading={aiSuggestions.isLoading}
                              suggestionPosition={aiSuggestions.position}
                              onAcceptSuggestion={(editor , monaco)=>aiSuggestions.acceptSuggestion(editor , monaco)}
                              onRejectSuggestion={(editor) =>
                                aiSuggestions.rejectSuggestion(editor)
                              }
                              onTriggerSuggestion={(type, editor) =>
                                aiSuggestions.fetchSuggestion(type, editor)
                              }
                              highlightCurrentLine={highlightCurrentLine}
                            />
                          ) : (
                            <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground gap-4">
                              <FileText className="h-16 w-16 text-[#1E2D45]" />
                              <div className="text-center">
                                <p className="text-lg font-medium text-[#A5B8CC]">No files open</p>
                                <p className="text-sm text-[#6B8CAE]">
                                  Select a file from the sidebar to start editing
                                </p>
                              </div>
                            </div>
                          )}
                        </ResizablePanel>

                        {isPreviewVisible && (
                          <>
                            <ResizableHandle className="w-[1.5px] bg-[#1E2D45] hover:bg-[#2A4A7F] transition-colors" />
                            <ResizablePanel defaultSize={50} className="bg-[#0D1221] border-l border-[#1E2D45]">
                              <WebContainerPreview
                                templateData={templateData}
                                instance={instance}
                                writeFileSync={writeFileSync}
                                isLoading={containerLoading}
                                error={containerError}
                                serverUrl={serverUrl!}
                                forceResetup={false}
                              />
                            </ResizablePanel>
                          </>
                        )}
                      </ResizablePanelGroup>
                    </div>
                  </div>
              </>
            )}
          </div>
        </SidebarInset>
        {playgroundData?.githubRepo && playgroundData?.githubBranch && (
          <CommitDialog
            isOpen={isCommitDialogOpen}
            onClose={() => setIsCommitDialogOpen(false)}
            playgroundId={id}
            githubRepo={playgroundData.githubRepo}
            githubBranch={playgroundData.githubBranch}
          />
        )}
      </>
    </TooltipProvider>
  );
};

export default MainPlaygroundPage;

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
} from "lucide-react";
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
  } = useWebContainer({ templateData });

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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] p-4">
        <div className="w-full max-w-md p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold mb-6 text-center">
            Loading Playground
          </h2>
          <div className="mb-8">
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
        />
        <SidebarInset className="relative flex flex-col bg-[#020B1F] text-[#e8f4ff] border-l border-[rgba(0,212,255,0.08)]">
          {/* Subtle grid background and glowing ambient orbs */}
          <div className="absolute inset-0 z-0 pointer-events-none opacity-20">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,212,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,212,255,0.05)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-[#8B5CF6]/10 rounded-full blur-[100px]" />
          </div>

          <header className="relative z-10 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[rgba(0,212,255,0.08)] px-6 bg-[rgba(2,11,31,0.6)] backdrop-blur-md">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-8 w-8 rounded-lg text-[#00D4FF] hover:bg-[#00D4FF]/10 hover:text-white border border-[rgba(0,212,255,0.15)] shadow-[0_0_10px_rgba(0,212,255,0.05)] transition-all duration-300 cursor-pointer" />
              <Separator orientation="vertical" className="h-4 bg-[rgba(0,212,255,0.15)]" />

              <div className="flex flex-col">
                <h1 className="text-sm font-semibold text-white tracking-wide flex items-center gap-1.5 font-jetbrains">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00D4FF] animate-pulse" />
                  {playgroundData?.title || "Code Playground"}
                </h1>
                <p className="text-[10px] text-[#7ca8cc] font-jetbrains">
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
                    className="h-8 px-3 rounded-lg text-xs font-semibold font-jetbrains border border-[rgba(0,212,255,0.15)] bg-[#00D4FF]/5 hover:bg-[#00D4FF]/15 text-[#00D4FF] disabled:opacity-40 transition-all duration-300 cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" /> Save
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#071428] border border-[rgba(0,212,255,0.25)] text-[#e8f4ff] font-jetbrains text-xs">Save (Ctrl+S)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleSaveAll}
                    disabled={!hasUnsavedChanges}
                    className="h-8 px-3 rounded-lg text-xs font-semibold font-jetbrains border border-[rgba(139,92,246,0.15)] bg-[#8B5CF6]/5 hover:bg-[#8B5CF6]/15 text-[#8B5CF6] disabled:opacity-40 transition-all duration-300 cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" /> Save All
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-[#071428] border border-[rgba(139,92,246,0.25)] text-[#e8f4ff] font-jetbrains text-xs">Save All (Ctrl+Shift+S)</TooltipContent>
              </Tooltip>

              <ToggleAI
                isEnabled={aiSuggestions.isEnabled}
                onToggle={aiSuggestions.toggleEnabled}
                suggestionLoading={aiSuggestions.isLoading}
                isChatOpen={isChatOpen}
                onToggleChat={setIsChatOpen}
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg border border-[rgba(0,180,255,0.15)] text-[#7ca8cc] hover:text-white hover:bg-[#00D4FF]/10 transition-colors cursor-pointer">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-[#071428] border border-[rgba(0,180,255,0.25)] text-[#e8f4ff] rounded-xl shadow-2xl p-1">
                  <DropdownMenuItem
                    onClick={() => setIsPreviewVisible(!isPreviewVisible)}
                    className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-[#00D4FF]/10 cursor-pointer transition-colors focus:bg-[#00D4FF]/10 focus:text-white"
                  >
                    {isPreviewVisible ? "Hide" : "Show"} Preview Panel
                  </DropdownMenuItem>
                  <DropdownMenuCheckboxItem
                    checked={highlightCurrentLine}
                    onCheckedChange={setHighlightCurrentLine}
                    className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-[#00D4FF]/10 text-[#e8f4ff] cursor-pointer transition-colors focus:bg-[#00D4FF]/10 focus:text-[#00D4FF] focus:bg-[#00D4FF]/10 data-[state=checked]:text-[#00D4FF] data-[state=checked]:font-semibold"
                  >
                    Highlight Active Line
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator className="bg-[rgba(0,180,255,0.08)]" />
                  <DropdownMenuItem onClick={closeAllFiles} className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-rose-500/10 text-rose-400 cursor-pointer transition-colors focus:bg-rose-500/10 focus:text-rose-400">
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
                {openFiles.length > 0 ? (
                  <div className="h-full flex flex-col">
                    <div className="border-b border-[rgba(0,212,255,0.08)] bg-[rgba(2,11,31,0.4)] px-4 py-2">
                      <Tabs
                        value={activeFileId || ""}
                        onValueChange={setActiveFileId}
                        className="w-full"
                      >
                        <div className="flex items-center justify-between">
                          <TabsList className="h-10 bg-transparent p-0 flex gap-2">
                            {openFiles.map((file) => {
                              const isActive = file.id === activeFileId;
                              return (
                                <TabsTrigger
                                  key={file.id}
                                  value={file.id}
                                  className={cn(
                                    "relative h-9 px-4 rounded-xl transition-all duration-300 cursor-pointer font-jetbrains text-xs flex items-center gap-2 border outline-none",
                                    isActive
                                      ? "bg-gradient-to-r from-[rgba(0,212,255,0.12)] to-[rgba(139,92,246,0.12)] text-[#00D4FF] border-[rgba(0,212,255,0.25)] shadow-[0_2px_10px_rgba(0,212,255,0.08)]"
                                      : "bg-transparent text-[#7ca8cc] border-transparent hover:text-white hover:bg-[rgba(0,212,255,0.04)]"
                                  )}
                                >
                                  <FileText className={cn("h-3.5 w-3.5", isActive ? "text-[#00D4FF]" : "text-[#3a6080]")} />
                                  <span>
                                    {file.filename}.{file.fileExtension}
                                  </span>
                                  {file.hasUnsavedChanges && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
                                  )}
                                  <span
                                    className="ml-2 h-4 w-4 hover:bg-rose-500/20 hover:text-rose-400 rounded-md flex items-center justify-center transition-all cursor-pointer opacity-40 hover:opacity-100"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      closeFile(file.id);
                                    }}
                                  >
                                    <X className="size-3" />
                                  </span>
                                  
                                  {/* Gradient active bottom indicator */}
                                  {isActive && (
                                    <span className="absolute bottom-[-9px] left-0 right-0 h-[2px] bg-gradient-to-r from-[#00D4FF] via-[#3B82F6] to-[#8B5CF6] rounded-full" />
                                  )}
                                </TabsTrigger>
                              );
                            })}
                          </TabsList>

                          {openFiles.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={closeAllFiles}
                              className="h-7 px-3 text-xs font-semibold rounded-lg border border-[rgba(0,212,255,0.15)] text-[#7ca8cc] hover:text-[#00D4FF] hover:bg-[#00D4FF]/10 transition-all cursor-pointer"
                            >
                              Close All
                            </Button>
                          )}
                        </div>
                      </Tabs>
                    </div>
                    <div className="flex-1 bg-[rgba(2,11,31,0.2)]">
                      <ResizablePanelGroup
                        direction="horizontal"
                        className="h-full"
                      >
                        <ResizablePanel defaultSize={isPreviewVisible ? 50 : 100} className="relative">
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
                        </ResizablePanel>

                        {isPreviewVisible && (
                          <>
                            <ResizableHandle className="w-[1.5px] bg-[rgba(0,212,255,0.08)] hover:bg-[#00D4FF]/50 transition-colors" />
                            <ResizablePanel defaultSize={50} className="bg-[rgba(2,11,31,0.3)] border-l border-[rgba(0,212,255,0.08)]">
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
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground gap-4">
                    <FileText className="h-16 w-16 text-gray-300" />
                    <div className="text-center">
                      <p className="text-lg font-medium">No files open</p>
                      <p className="text-sm text-gray-500">
                        Select a file from the sidebar to start editing
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </SidebarInset>
      </>
    </TooltipProvider>
  );
};

export default MainPlaygroundPage;

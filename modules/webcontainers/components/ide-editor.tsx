"use client";

import React from "react";
import Image from "next/image";
import { useMonaco } from "@monaco-editor/react";
import { cn } from "@/lib/utils";
import { FileText, X } from "lucide-react";
import { PlaygroundEditor } from "@/modules/playground/components/playground-editor";
import { getFileDisplayName } from "@/modules/playground/lib";

interface OpenFile {
  id: string;
  filename: string;
  fileExtension: string;
  hasUnsavedChanges: boolean;
  content: string;
  isPreview?: boolean;
}

interface IdeEditorProps {
  openFiles: OpenFile[];
  activeFileId: string | null;
  onFileSelect: (id: string) => void;
  onFileClose: (id: string) => void;
  onContentChange: (id: string, content: string) => void;
}

export function IdeEditor({
  openFiles,
  activeFileId,
  onFileSelect,
  onFileClose,
  onContentChange,
}: IdeEditorProps) {
  const activeFile = openFiles.find((f) => f.id === activeFileId);
  const monaco = useMonaco();

  // Each open file gets its own persistent Monaco model (see PlaygroundEditor's
  // `path` prop) so per-file undo history survives tab switches. Closing a tab
  // for good should dispose that model rather than leaking it for the session.
  const handleFileClose = (fileId: string) => {
    try {
      const model = monaco?.editor.getModel(monaco.Uri.parse(fileId));
      model?.dispose();
    } catch {
      // Non-fatal — worst case the model is leaked for this session.
    }
    onFileClose(fileId);
  };

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Editor Tabs */}
      {openFiles.length > 0 && (
        <div className="flex h-9 bg-sidebar overflow-x-auto no-scrollbar">
          {openFiles.map((file) => {
            const isActive = file.id === activeFileId;
            return (
              <div
                key={file.id}
                onClick={() => onFileSelect(file.id)}
                data-state={isActive ? "active" : "inactive"}
                className={cn(
                  "playground-tab group relative flex items-center h-full px-3 gap-2 min-w-[120px] max-w-[200px] border-r border-border cursor-pointer shrink-0 transition-colors",
                  isActive ? "bg-background text-foreground" : "bg-sidebar text-foreground/70 hover:bg-sidebar-accent/50",
                  file.isPreview ? "italic" : ""
                )}
              >
                {isActive && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
                )}
                <FileText className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-foreground/70")} />
                <span className="truncate text-[13px] select-none flex-1 font-sans">
                  {getFileDisplayName(file.filename, file.fileExtension)}
                </span>
                
                <div className="flex items-center justify-center w-5 h-5 shrink-0">
                  {file.hasUnsavedChanges ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-foreground group-hover:hidden" />
                  ) : null}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFileClose(file.id);
                    }}
                    className={cn(
                      "close-btn w-5 h-5 rounded hover:bg-foreground/20 flex items-center justify-center text-foreground/70 hover:text-foreground transition-colors",
                      file.hasUnsavedChanges ? "hidden group-hover:flex" : ""
                    )}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor Content */}
      <div className="flex-1 min-h-0 bg-background relative">
        {activeFile ? (
          <PlaygroundEditor
            activeFile={activeFile}
            fileId={activeFile.id}
            content={activeFile.content}
            onContentChange={(val) => onContentChange(activeFile.id, val)}
            highlightCurrentLine={true}
          />
        ) : (
          // Centered within this editor container (not the viewport) via flex
          // centering on an absolutely-positioned overlay — this reflows live
          // with the container's own rendered size as the surrounding sidebar,
          // preview, and terminal panels are resized, no JS recalculation needed.
          // Placeholder mark: swap for a dedicated watermark asset if one is added.
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <Image
              src="/icon-bg-removed.png"
              alt=""
              width={195}
              height={200}
              className="object-contain opacity-[0.06] dark:opacity-[0.08]"
              priority={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}

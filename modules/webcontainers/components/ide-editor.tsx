"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { FileText, X, Command, Search, Settings, Maximize } from "lucide-react";
import { PlaygroundEditor } from "@/modules/playground/components/playground-editor";
import { Badge } from "@/components/ui/badge";

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
                  {file.filename}.{file.fileExtension}
                </span>
                
                <div className="flex items-center justify-center w-5 h-5 shrink-0">
                  {file.hasUnsavedChanges ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-foreground group-hover:hidden" />
                  ) : null}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFileClose(file.id);
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
            content={activeFile.content}
            onContentChange={(val) => onContentChange(activeFile.id, val)}
            highlightCurrentLine={true}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col justify-center px-12 md:px-24">
            <div className="max-w-md w-full">
              <FileText className="w-16 h-16 mb-8 text-foreground/20" />
              <div className="grid grid-cols-[1fr_auto] gap-x-8 gap-y-6 text-sm text-foreground/70 font-sans items-center">
                <div className="text-right">Show All Commands</div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="font-mono text-foreground/80 rounded-md bg-foreground/5 border-foreground/20">Ctrl</Badge>
                  <span className="text-foreground/50">+</span>
                  <Badge variant="outline" className="font-mono text-foreground/80 rounded-md bg-foreground/5 border-foreground/20">Shift</Badge>
                  <span className="text-foreground/50">+</span>
                  <Badge variant="outline" className="font-mono text-foreground/80 rounded-md bg-foreground/5 border-foreground/20">P</Badge>
                </div>
                
                <div className="text-right">Go to File</div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="font-mono text-foreground/80 rounded-md bg-foreground/5 border-foreground/20">Ctrl</Badge>
                  <span className="text-foreground/50">+</span>
                  <Badge variant="outline" className="font-mono text-foreground/80 rounded-md bg-foreground/5 border-foreground/20">P</Badge>
                </div>

                <div className="text-right">Find in Files</div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="font-mono text-foreground/80 rounded-md bg-foreground/5 border-foreground/20">Ctrl</Badge>
                  <span className="text-foreground/50">+</span>
                  <Badge variant="outline" className="font-mono text-foreground/80 rounded-md bg-foreground/5 border-foreground/20">Shift</Badge>
                  <span className="text-foreground/50">+</span>
                  <Badge variant="outline" className="font-mono text-foreground/80 rounded-md bg-foreground/5 border-foreground/20">F</Badge>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

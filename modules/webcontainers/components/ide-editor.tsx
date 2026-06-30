"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { FileText, X, Command, Search, Settings, Maximize } from "lucide-react";
import { PlaygroundEditor } from "@/modules/playground/components/playground-editor";

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
    <div className="flex flex-col h-full w-full bg-[#1e1e1e]">
      {/* Editor Tabs */}
      {openFiles.length > 0 && (
        <div className="flex h-9 bg-[#252526] overflow-x-auto no-scrollbar">
          {openFiles.map((file) => {
            const isActive = file.id === activeFileId;
            return (
              <div
                key={file.id}
                onClick={() => onFileSelect(file.id)}
                className={cn(
                  "group relative flex items-center h-full px-3 gap-2 min-w-[120px] max-w-[200px] border-r border-[#2d2d2d] cursor-pointer shrink-0",
                  isActive ? "bg-[#1e1e1e] text-[#ffffff]" : "bg-[#2d2d2d] text-[#969696] hover:bg-[#2d2d2d]/80",
                  file.isPreview ? "italic" : ""
                )}
              >
                {isActive && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#007fd4]" />
                )}
                <FileText className={cn("h-4 w-4 shrink-0", isActive ? "text-[#38BDF8]" : "text-[#515151]")} />
                <span className="truncate text-[13px] select-none flex-1">
                  {file.filename}.{file.fileExtension}
                </span>
                
                <div className="flex items-center justify-center w-5 h-5 shrink-0">
                  {file.hasUnsavedChanges ? (
                    <div className="w-2.5 h-2.5 rounded-full bg-white group-hover:hidden" />
                  ) : null}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onFileClose(file.id);
                    }}
                    className={cn(
                      "w-5 h-5 rounded hover:bg-[#333333] flex items-center justify-center text-[#969696] hover:text-[#ffffff] transition-colors",
                      file.hasUnsavedChanges ? "hidden group-hover:flex" : "opacity-0 group-hover:opacity-100",
                      isActive ? "opacity-100" : ""
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
      <div className="flex-1 min-h-0 bg-[#1e1e1e]">
        {activeFile ? (
          <PlaygroundEditor
            activeFile={activeFile}
            content={activeFile.content}
            onContentChange={(val) => onContentChange(activeFile.id, val)}
            highlightCurrentLine={true}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[#616161]">
            <FileText className="w-24 h-24 mb-8 opacity-20" />
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-[13px]">
              <div className="flex justify-end">Show All Commands</div>
              <div className="flex items-center gap-1 font-semibold text-[#858585]">
                <span className="px-1.5 py-0.5 rounded bg-[#333333] border border-[#444444]">Ctrl</span>
                <span>+</span>
                <span className="px-1.5 py-0.5 rounded bg-[#333333] border border-[#444444]">Shift</span>
                <span>+</span>
                <span className="px-1.5 py-0.5 rounded bg-[#333333] border border-[#444444]">P</span>
              </div>
              
              <div className="flex justify-end">Go to File</div>
              <div className="flex items-center gap-1 font-semibold text-[#858585]">
                <span className="px-1.5 py-0.5 rounded bg-[#333333] border border-[#444444]">Ctrl</span>
                <span>+</span>
                <span className="px-1.5 py-0.5 rounded bg-[#333333] border border-[#444444]">P</span>
              </div>

              <div className="flex justify-end">Find in Files</div>
              <div className="flex items-center gap-1 font-semibold text-[#858585]">
                <span className="px-1.5 py-0.5 rounded bg-[#333333] border border-[#444444]">Ctrl</span>
                <span>+</span>
                <span className="px-1.5 py-0.5 rounded bg-[#333333] border border-[#444444]">Shift</span>
                <span>+</span>
                <span className="px-1.5 py-0.5 rounded bg-[#333333] border border-[#444444]">F</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { IdeSidebar, IdeActivityBar } from "./ide-sidebar";
import { IdeEditor } from "./ide-editor";
import { IdeTerminal } from "./ide-terminal";
import { IdePreview } from "./ide-preview";
import { IdeTopbar } from "./ide-topbar";
import { useIdeLayout } from "../hooks/useIdeLayout";
import { useFileExplorer } from "@/modules/playground/hooks/useFileExplorer";

interface IdeLayoutProps {
  instance: unknown;
  explorerContent: React.ReactNode;
}

export function IdeLayout({ instance, explorerContent }: IdeLayoutProps) {
  const { isPreviewVisible } = useIdeLayout();
  const {
    openFiles,
    activeFileId,
    setActiveFileId,
    closeFile,
    updateFileContent,
  } = useFileExplorer();

  // State for pane sizes
  const [explorerWidth, setExplorerWidth] = useState(260);
  const [terminalHeight, setTerminalHeight] = useState(280);
  const [previewWidth, setPreviewWidth] = useState(380);
  const [activeTab, setActiveTab] = useState("explorer");

  // Drag handlers
  const handleExplorerResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = explorerWidth;
    document.body.style.cursor = "col-resize";

    const onPointerMove = (moveEvent: PointerEvent) => {
      const newWidth = startWidth + (moveEvent.clientX - startX);
      setExplorerWidth(Math.min(Math.max(newWidth, 180), 400));
    };

    const onPointerUp = () => {
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleTerminalResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = terminalHeight;
    document.body.style.cursor = "row-resize";

    const onPointerMove = (moveEvent: PointerEvent) => {
      const newHeight = startHeight + (startY - moveEvent.clientY);
      setTerminalHeight(Math.min(Math.max(newHeight, 120), 600));
    };

    const onPointerUp = () => {
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handlePreviewResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = previewWidth;
    document.body.style.cursor = "col-resize";

    const onPointerMove = (moveEvent: PointerEvent) => {
      const newWidth = startWidth + (startX - moveEvent.clientX);
      setPreviewWidth(Math.min(Math.max(newWidth, 280), 700));
    };

    const onPointerUp = () => {
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground overflow-hidden font-sans">
      <div className="shrink-0">
        <IdeTopbar />
      </div>

      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ICON RAIL - Fixed width, never resizes */}
        <IdeActivityBar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* LEFT: File Explorer */}
        <div style={{ flex: `0 0 ${explorerWidth}px`, minWidth: '180px', maxWidth: '400px', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="bg-sidebar">
            <IdeSidebar activeTab={activeTab}>{explorerContent}</IdeSidebar>
          </div>
        </div>
        
        {/* Resize Handle (Explorer <-> Center) */}
        <div
          onPointerDown={handleExplorerResize}
          className="w-1 shrink-0 bg-border hover:bg-primary cursor-col-resize transition-colors z-10"
        />

        {/* CENTER: Editor (Top) + Terminal (Bottom) */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0, height: '100%' }}>

          {/* CENTER-TOP: Code Editor / Welcome Screen */}
          <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
            <div className="h-full w-full">
              <IdeEditor
                openFiles={openFiles}
                activeFileId={activeFileId}
                onFileSelect={setActiveFileId}
                onFileClose={closeFile}
                onContentChange={updateFileContent}
              />
            </div>
          </div>

          {/* Resize Handle (Editor <-> Terminal) */}
          <div
            onPointerDown={handleTerminalResize}
            className="h-1 shrink-0 bg-border hover:bg-primary cursor-row-resize transition-colors z-10"
          />

          {/* CENTER-BOTTOM: Terminal */}
          <div style={{ flex: `0 0 ${terminalHeight}px`, minHeight: '120px', maxHeight: '600px', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} className="h-full w-full">
              <IdeTerminal instance={instance} />
            </div>
          </div>
        </div>

        {/* RIGHT: Preview (conditionally rendered) */}
        {isPreviewVisible && (
          <>
            {/* Resize Handle (Center <-> Preview) */}
            <div
              onPointerDown={handlePreviewResize}
              className="w-1 shrink-0 bg-border hover:bg-primary cursor-col-resize transition-colors z-10"
            />
            
            <div style={{ flex: `0 0 ${previewWidth}px`, minWidth: 0, height: '100%', overflow: 'hidden' }}>
              <div className="h-full w-full bg-background">
                <IdePreview instance={instance} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

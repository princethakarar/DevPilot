"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { IdeSidebar, IdeActivityBar } from "./ide-sidebar";
import { IdeEditor } from "./ide-editor";
import { IdeTerminal } from "./ide-terminal";
import { IdePreview } from "./ide-preview";
import { IdeTopbar } from "./ide-topbar";
import { useIdeLayout } from "../hooks/useIdeLayout";
import { useFileExplorer } from "@/modules/playground/hooks/useFileExplorer";

/**
 * VS Code-style hairline divider: a 1px visible line inside a wider invisible
 * drag-catch zone, so the resize handle stays easy to grab without looking thick.
 */
function ResizeHandle({
  direction,
  onPointerDown,
}: {
  direction: "col" | "row";
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const isCol = direction === "col";
  return (
    <div
      onPointerDown={onPointerDown}
      className={cn(
        "group/resize relative shrink-0 z-10",
        isCol ? "w-2 cursor-col-resize" : "h-2 cursor-row-resize"
      )}
    >
      <div
        className={cn(
          "absolute bg-border group-hover/resize:bg-primary transition-colors",
          isCol ? "inset-y-0 left-1/2 -translate-x-1/2 w-px" : "inset-x-0 top-1/2 -translate-y-1/2 h-px"
        )}
      />
    </div>
  );
}

interface IdeLayoutProps {
  instance: unknown;
  explorerContent: React.ReactNode;
  sourceControlContent?: React.ReactNode;
  projectName?: string;
  /** Called with the tab being left/closed, before the switch/close itself happens
   *  — used to flush a dirty file's unsaved changes so they're never lost. */
  onBeforeFileSelect?: (currentFileId: string | null) => void;
  onBeforeFileClose?: (fileId: string) => void;
}

export function IdeLayout({
  instance,
  explorerContent,
  sourceControlContent,
  projectName,
  onBeforeFileSelect,
  onBeforeFileClose,
}: IdeLayoutProps) {
  const { isPreviewVisible } = useIdeLayout();
  const {
    openFiles,
    activeFileId,
    setActiveFileId,
    closeFile,
    updateFileContent,
  } = useFileExplorer();

  const handleFileSelect = (fileId: string) => {
    if (fileId !== activeFileId) onBeforeFileSelect?.(activeFileId);
    setActiveFileId(fileId);
  };

  const handleFileClose = (fileId: string) => {
    onBeforeFileClose?.(fileId);
    closeFile(fileId);
  };

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
        <IdeTopbar projectName={projectName} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ICON RAIL - Fixed width, never resizes */}
        <IdeActivityBar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* LEFT: File Explorer */}
        <div style={{ flex: `0 0 ${explorerWidth}px`, minWidth: '180px', maxWidth: '400px', height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="bg-sidebar">
            <IdeSidebar activeTab={activeTab} sourceControlContent={sourceControlContent}>
              {explorerContent}
            </IdeSidebar>
          </div>
        </div>
        
        {/* Resize Handle (Explorer <-> Center) */}
        <ResizeHandle direction="col" onPointerDown={handleExplorerResize} />

        {/* CENTER: Editor (Top) + Terminal (Bottom) */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0, height: '100%' }}>

          {/* CENTER-TOP: Code Editor / Welcome Screen */}
          <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}>
            <div className="h-full w-full">
              <IdeEditor
                openFiles={openFiles}
                activeFileId={activeFileId}
                onFileSelect={handleFileSelect}
                onFileClose={handleFileClose}
                onContentChange={updateFileContent}
              />
            </div>
          </div>

          {/* Resize Handle (Editor <-> Terminal) */}
          <ResizeHandle direction="row" onPointerDown={handleTerminalResize} />

          {/* CENTER-BOTTOM: Terminal */}
          <div style={{ flex: `0 0 ${terminalHeight}px`, minHeight: '120px', maxHeight: '600px', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} className="h-full w-full">
              <IdeTerminal instance={instance} projectName={projectName} />
            </div>
          </div>
        </div>

        {/* RIGHT: Preview — kept mounted even while hidden (display:none, not
            unmounted) so its WebContainer "server-ready" listener never misses
            the event while the panel happens to be toggled off. Unmounting it
            meant reopening the panel after boot finished left preview stuck on
            "not available" until the dev server was restarted. */}
        {isPreviewVisible && (
          <ResizeHandle direction="col" onPointerDown={handlePreviewResize} />
        )}
        <div
          style={{
            flex: isPreviewVisible ? `0 0 ${previewWidth}px` : "0 0 0px",
            minWidth: 0,
            height: '100%',
            overflow: 'hidden',
            display: isPreviewVisible ? undefined : 'none',
          }}
        >
          <div className="h-full w-full bg-background">
            <IdePreview instance={instance} />
          </div>
        </div>
      </div>
    </div>
  );
}

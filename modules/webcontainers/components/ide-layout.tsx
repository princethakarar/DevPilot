"use client";

import React, { useEffect } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { IdeSidebar } from "./ide-sidebar";
import { IdeEditor } from "./ide-editor";
import { IdeTerminal } from "./ide-terminal";
import { IdePreview } from "./ide-preview";
import { IdeTopbar } from "./ide-topbar";
import { useIdeLayout } from "../hooks/useIdeLayout";
import { useFileExplorer } from "@/modules/playground/hooks/useFileExplorer";

interface IdeLayoutProps {
  instance: any;
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

  // Load layout from localStorage if we wanted custom layout management, 
  // but react-resizable-panels handles it via autoSaveId!

  return (
    <div className="flex flex-col h-screen w-full bg-[#1e1e1e] text-[#cccccc] overflow-hidden font-sans">
      <IdeTopbar />
      
      <div className="flex-1 min-h-0">
        {/* @ts-expect-error ResizablePanelGroup missing direction in typings */}
        <ResizablePanelGroup direction="horizontal" autoSaveId="ide-layout-main">
          
          {/* Left Sidebar Pane */}
          <ResizablePanel defaultSize={20} minSize={15} maxSize={40} className="bg-[#18181b]">
            <IdeSidebar>
              {explorerContent}
            </IdeSidebar>
          </ResizablePanel>
          
          <ResizableHandle className="w-1 bg-[#2d2d2d] hover:bg-[#007fd4] transition-colors" />
          
          {/* Center Pane (Editor + Terminal) */}
          <ResizablePanel defaultSize={isPreviewVisible ? 40 : 80} minSize={20}>
            {/* @ts-expect-error ResizablePanelGroup missing direction in typings */}
            <ResizablePanelGroup direction="vertical" autoSaveId="ide-layout-center">
              
              {/* Editor Pane */}
              <ResizablePanel defaultSize={70} minSize={30}>
                <IdeEditor
                  openFiles={openFiles}
                  activeFileId={activeFileId}
                  onFileSelect={setActiveFileId}
                  onFileClose={closeFile}
                  onContentChange={updateFileContent}
                />
              </ResizablePanel>
              
              <ResizableHandle className="h-1 bg-[#2d2d2d] hover:bg-[#007fd4] transition-colors" />
              
              {/* Terminal Pane */}
              <ResizablePanel defaultSize={30} minSize={15}>
                <IdeTerminal instance={instance} />
              </ResizablePanel>
              
            </ResizablePanelGroup>
          </ResizablePanel>
          
          {/* Right Preview Pane */}
          {isPreviewVisible && (
            <>
              <ResizableHandle className="w-1 bg-[#2d2d2d] hover:bg-[#007fd4] transition-colors" />
              <ResizablePanel defaultSize={40} minSize={20} className="bg-[#ffffff]">
                <IdePreview instance={instance} />
              </ResizablePanel>
            </>
          )}
          
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

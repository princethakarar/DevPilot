"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { FilesIcon, SourceControlIcon } from "./codicons";
import { useSourceControl } from "@/modules/playground/hooks/useSourceControl";

interface IdeSidebarProps {
  children?: React.ReactNode;
  sourceControlContent?: React.ReactNode;
  activeTab: string;
}

interface IdeActivityBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

interface RailButtonProps {
  isActive: boolean;
  title: string;
  onClick: () => void;
  badgeCount?: number;
  children: React.ReactNode;
}

/**
 * Matches VS Code's activity bar interaction pattern: a full-height left accent
 * bar + full-opacity icon marks the active panel; a subtle centered rounded
 * highlight (not the whole 48px cell) appears on hover of either state.
 */
function RailButton({ isActive, title, onClick, badgeCount, children }: RailButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "group relative w-full h-12 flex items-center justify-center border-l-2 transition-colors duration-150",
        isActive ? "border-primary" : "border-transparent"
      )}
    >
      <span
        className={cn(
          "relative flex items-center justify-center w-8 h-8 rounded-md transition-colors duration-150 group-hover:bg-foreground/10",
          isActive ? "text-foreground" : "text-foreground/60 group-hover:text-foreground/85"
        )}
      >
        {children}
        {!!badgeCount && badgeCount > 0 && (
          <span className="absolute -bottom-1 -right-1 min-w-[16px] h-[16px] px-[3px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none flex items-center justify-center">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </span>
    </button>
  );
}

export function IdeActivityBar({ activeTab, setActiveTab }: IdeActivityBarProps) {
  const changedFilesCount = useSourceControl((s) => s.changes.length);

  return (
    <div style={{ flex: '0 0 48px', minWidth: '48px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'visible' }} className="py-2 border-r border-border bg-sidebar shrink-0">
        <div className="flex flex-col items-center gap-2">
          <RailButton
            isActive={activeTab === "explorer"}
            title="Explorer"
            onClick={() => setActiveTab("explorer")}
          >
            <FilesIcon className="w-6 h-6" />
          </RailButton>
          <RailButton
            isActive={activeTab === "source-control"}
            title="Source Control"
            onClick={() => setActiveTab("source-control")}
            badgeCount={changedFilesCount}
          >
            <SourceControlIcon className="w-6 h-6" />
          </RailButton>
        </div>
    </div>
  );
}

export function IdeSidebar({ children, sourceControlContent, activeTab }: IdeSidebarProps) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-sidebar h-full overflow-hidden border-r border-border">
        {activeTab === "explorer" && (
          <div className="flex-1 overflow-hidden h-full">
            {children}
          </div>
        )}
        {activeTab === "source-control" && (
          <div className="flex-1 overflow-hidden h-full">
            {sourceControlContent}
          </div>
        )}
      </div>
  );
}

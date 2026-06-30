"use client";

import React, { useState } from "react";
import { Files, Search, GitMerge, Blocks, User, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface IdeSidebarProps {
  children?: React.ReactNode;
  activeTab: string;
}

interface IdeActivityBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function IdeActivityBar({ activeTab, setActiveTab }: IdeActivityBarProps) {
  return (
    <div style={{ flex: '0 0 48px', minWidth: '48px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'visible' }} className="py-2 border-r border-border bg-sidebar shrink-0 justify-between">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setActiveTab("explorer")}
            className={cn(
              "w-full h-12 flex items-center justify-center border-l-2 transition-colors",
              activeTab === "explorer"
                ? "border-primary text-primary"
                : "border-transparent text-foreground/70 hover:text-foreground"
            )}
            title="Explorer"
          >
            <Files className="w-6 h-6" />
          </button>
          <button
            onClick={() => setActiveTab("search")}
            className={cn(
              "w-full h-12 flex items-center justify-center border-l-2 transition-colors",
              activeTab === "search"
                ? "border-primary text-primary"
                : "border-transparent text-foreground/70 hover:text-foreground"
            )}
            title="Search"
          >
            <Search className="w-6 h-6" />
          </button>
          <button
            onClick={() => setActiveTab("source-control")}
            className={cn(
              "w-full h-12 flex items-center justify-center border-l-2 transition-colors",
              activeTab === "source-control"
                ? "border-primary text-primary"
                : "border-transparent text-foreground/70 hover:text-foreground"
            )}
            title="Source Control"
          >
            <GitMerge className="w-6 h-6" />
          </button>
          <button
            onClick={() => setActiveTab("extensions")}
            className={cn(
              "w-full h-12 flex items-center justify-center border-l-2 transition-colors",
              activeTab === "extensions"
                ? "border-primary text-primary"
                : "border-transparent text-foreground/70 hover:text-foreground"
            )}
            title="Extensions"
          >
            <Blocks className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            className="w-full h-12 flex items-center justify-center border-l-2 border-transparent text-foreground/70 hover:text-foreground transition-colors"
            title="Accounts"
          >
            <User className="w-6 h-6" />
          </button>
          <button
            className="w-full h-12 flex items-center justify-center border-l-2 border-transparent text-foreground/70 hover:text-foreground transition-colors"
            title="Settings"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>
    </div>
  );
}

export function IdeSidebar({ children, activeTab }: IdeSidebarProps) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-sidebar h-full overflow-hidden border-r border-border">
        {activeTab === "explorer" && (
          <div className="flex-1 overflow-hidden h-full">
            {children}
          </div>
        )}
        {activeTab !== "explorer" && (
          <div className="p-4 text-foreground/70 text-sm uppercase tracking-wider font-semibold">
            {activeTab.replace("-", " ")}
          </div>
        )}
      </div>
  );
}

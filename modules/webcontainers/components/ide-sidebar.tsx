"use client";

import React, { useState } from "react";
import { Files, Search, GitMerge, Blocks, User, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface IdeSidebarProps {
  children?: React.ReactNode;
}

export function IdeSidebar({ children }: IdeSidebarProps) {
  const [activeTab, setActiveTab] = useState("explorer");

  return (
    <div className="flex h-full w-full bg-[#18181b] border-r border-[#27272a] overflow-hidden">
      {/* Activity Bar (Icons Column) */}
      <div className="w-12 shrink-0 flex flex-col justify-between py-2 border-r border-[#27272a] bg-[#18181b]">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => setActiveTab("explorer")}
            className={cn(
              "w-full h-12 flex items-center justify-center border-l-2 transition-colors",
              activeTab === "explorer"
                ? "border-white text-white"
                : "border-transparent text-[#71717a] hover:text-[#d4d4d8]"
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
                ? "border-white text-white"
                : "border-transparent text-[#71717a] hover:text-[#d4d4d8]"
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
                ? "border-white text-white"
                : "border-transparent text-[#71717a] hover:text-[#d4d4d8]"
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
                ? "border-white text-white"
                : "border-transparent text-[#71717a] hover:text-[#d4d4d8]"
            )}
            title="Extensions"
          >
            <Blocks className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            className="w-full h-12 flex items-center justify-center border-l-2 border-transparent text-[#71717a] hover:text-[#d4d4d8] transition-colors"
            title="Accounts"
          >
            <User className="w-6 h-6" />
          </button>
          <button
            className="w-full h-12 flex items-center justify-center border-l-2 border-transparent text-[#71717a] hover:text-[#d4d4d8] transition-colors"
            title="Settings"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Expandable Panel */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0a0f1c]">
        {activeTab === "explorer" && (
          <div className="flex-1 overflow-hidden h-full">
            {children}
          </div>
        )}
        {activeTab !== "explorer" && (
          <div className="p-4 text-[#a1a1aa] text-sm uppercase tracking-wider font-semibold">
            {activeTab.replace("-", " ")}
          </div>
        )}
      </div>
    </div>
  );
}

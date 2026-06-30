"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Search, GitBranch, Share, User } from "lucide-react";

interface IdeTopbarProps {
  branchName?: string;
  projectName?: string;
  onCommitClick?: () => void;
  onSearchClick?: () => void;
}

export function IdeTopbar({
  branchName = "main",
  projectName = "Playground",
  onCommitClick,
  onSearchClick,
}: IdeTopbarProps) {
  return (
    <div className="h-10 shrink-0 flex items-center justify-between px-4 bg-[#18181b] border-b border-[#27272a] text-[#a1a1aa] text-sm">
      {/* Left: Source Control */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCommitClick}
          className="h-7 px-2 flex items-center gap-2 hover:bg-[#27272a] hover:text-[#d4d4d8] text-[#a1a1aa] rounded"
        >
          <GitBranch className="h-3.5 w-3.5" />
          <span className="text-xs">{branchName}</span>
        </Button>
      </div>

      {/* Center: Global Search Bar */}
      <div className="flex-1 flex justify-center max-w-xl px-4">
        <button
          onClick={onSearchClick}
          className="flex items-center gap-2 w-full max-w-md h-7 px-3 bg-[#27272a]/50 hover:bg-[#27272a] border border-[#3f3f46]/50 rounded-md transition-colors text-xs text-[#a1a1aa]"
        >
          <Search className="h-3.5 w-3.5" />
          <span>{projectName}</span>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 hover:bg-[#27272a] hover:text-[#d4d4d8] text-[#a1a1aa] rounded"
        >
          <Share className="h-3.5 w-3.5 mr-2" />
          <span className="text-xs">Share</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 rounded-full bg-[#27272a] text-[#d4d4d8] hover:bg-[#3f3f46]"
        >
          <User className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

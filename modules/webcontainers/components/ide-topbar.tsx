"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Search, GitBranch, Share, User, Check, Globe, PanelRight } from "lucide-react";
import { useIdeLayout } from "../hooks/useIdeLayout";

interface IdeTopbarProps {
  branchName?: string;
  projectName?: string;
  onCommitClick?: () => void;
  onSearchClick?: () => void;
}

export function IdeTopbar({
  branchName = "main*",
  projectName = "Playground",
  onCommitClick,
  onSearchClick,
}: IdeTopbarProps) {
  const { isPreviewVisible, setPreviewVisible } = useIdeLayout();

  return (
    <div className="h-12 shrink-0 flex items-center justify-between px-4 bg-background border-b border-border text-foreground font-sans">
      {/* Left: Source Control */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={onCommitClick}
          className="h-8 px-3 flex items-center gap-2 rounded bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Check className="h-4 w-4" />
          <span className="text-xs font-medium">Commit</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 rounded-md text-foreground border-border hover:bg-muted"
        >
          <Globe className="h-3.5 w-3.5 mr-2" />
          <span className="text-xs font-medium">Push to GitHub</span>
        </Button>
        <div className="flex items-center gap-1.5 px-2 text-foreground/70 hover:text-foreground cursor-pointer transition-colors">
          <GitBranch className="h-4 w-4" />
          <span className="text-xs font-medium">{branchName}</span>
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <div className="flex-1 flex justify-center px-4">
        <button
          onClick={onSearchClick}
          className="flex items-center gap-2 w-[40%] min-w-[200px] max-w-md h-8 px-4 bg-muted border border-border rounded-full hover:bg-muted/80 transition-colors text-xs text-foreground/70"
        >
          <Search className="h-4 w-4" />
          <span>{projectName}</span>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPreviewVisible(!isPreviewVisible)}
          className="h-8 px-3 rounded-md text-foreground border-border hover:bg-muted"
        >
          <PanelRight className="h-3.5 w-3.5 mr-2" />
          <span className="text-xs font-medium">{isPreviewVisible ? "Hide Preview" : "Show Preview"}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 rounded-md text-foreground border-border hover:bg-muted"
        >
          <Share className="h-3.5 w-3.5 mr-2" />
          <span className="text-xs font-medium">Share</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full bg-muted text-foreground border border-border hover:bg-muted/80"
        >
          <User className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

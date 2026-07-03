"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { PanelRight } from "lucide-react";
import { useIdeLayout } from "../hooks/useIdeLayout";

interface IdeTopbarProps {
  projectName?: string;
}

export function IdeTopbar({ projectName = "Playground" }: IdeTopbarProps) {
  const { isPreviewVisible, setPreviewVisible } = useIdeLayout();

  return (
    <div className="h-12 shrink-0 flex items-center justify-between px-4 bg-background border-b border-border text-foreground font-sans">
      {/* Left: spacer to keep project name visually centered */}
      <div className="flex items-center gap-2 w-[140px]" />

      {/* Center: Project Name */}
      <div className="flex-1 flex justify-center px-4">
        <span className="text-xs font-medium text-foreground/70 truncate max-w-md">
          {projectName}
        </span>
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
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState, useRef } from "react";
import { RefreshCw, Globe } from "lucide-react";
import { useIdeLayout } from "../hooks/useIdeLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface IdePreviewProps {
  instance: any;
}

export function IdePreview({ instance }: IdePreviewProps) {
  const { detectedServerUrl, setDetectedServerUrl } = useIdeLayout();
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setCurrentUrl(detectedServerUrl);
  }, [detectedServerUrl]);

  // Listen for WebContainer server-ready
  useEffect(() => {
    if (!instance) return;

    const handleServerReady = (port: number, url: string) => {
      console.log(`Server ready on port ${port}, url: ${url}`);
      setDetectedServerUrl(url);
    };

    instance.on("server-ready", handleServerReady);
    return () => {
      // @ts-ignore
      if (instance.off) instance.off("server-ready", handleServerReady);
    };
  }, [instance, setDetectedServerUrl]);

  const handleRefresh = () => {
    if (iframeRef.current && currentUrl) {
      iframeRef.current.src = currentUrl;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden font-sans">
      {/* Preview Toolbar */}
      <div className="flex items-center gap-2 px-3 h-9 shrink-0 bg-sidebar border-b border-border">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-foreground/70 hover:bg-sidebar-accent hover:text-foreground rounded-md"
          onClick={handleRefresh}
          disabled={!currentUrl}
          title="Reload preview"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
        <span className="flex-1 truncate text-[11px] font-mono text-foreground/50">
          {currentUrl || "No server running"}
        </span>
      </div>

      {/* Iframe content */}
      <div className="flex-1 bg-background relative">
        {currentUrl ? (
          <iframe
            ref={iframeRef}
            src={currentUrl}
            className="w-full h-full border-none bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            allow="cross-origin-isolated"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground/70 bg-background">
            <Globe className="h-16 w-16 mb-4 opacity-20" />
            <p className="text-sm font-semibold text-foreground">Preview not available</p>
            <p className="text-xs mt-2 text-foreground/70 max-w-[250px] text-center flex flex-col items-center gap-2">
              <span>Run the dev server to preview.</span>
              <Badge variant="outline" className="font-mono text-foreground/70 rounded-md bg-foreground/5 border-foreground/20">npm run dev</Badge>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState, useRef } from "react";
import { Lock, RefreshCw, ExternalLink, Globe } from "lucide-react";
import { useIdeLayout } from "../hooks/useIdeLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface IdePreviewProps {
  instance: any;
}

export function IdePreview({ instance }: IdePreviewProps) {
  const { detectedServerUrl, setDetectedServerUrl } = useIdeLayout();
  const [inputValue, setInputValue] = useState("");
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Auto-update URL bar when a new server URL is detected
  useEffect(() => {
    if (detectedServerUrl) {
      setInputValue(detectedServerUrl);
      setCurrentUrl(detectedServerUrl);
    }
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

  const handleOpenExternal = () => {
    if (currentUrl) {
      window.open(currentUrl, "_blank");
    }
  };

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue) return;

    let urlToLoad = inputValue;
    if (!urlToLoad.startsWith("http")) {
      urlToLoad = `https://${urlToLoad}`;
    }

    // Origin check
    if (detectedServerUrl) {
      try {
        const parsedToLoad = new URL(urlToLoad);
        const parsedBase = new URL(detectedServerUrl);
        
        const isAllowed = 
          parsedToLoad.hostname === parsedBase.hostname || 
          parsedToLoad.hostname.endsWith('.webcontainer.io') ||
          parsedToLoad.hostname.endsWith('.local-credentialless.webcontainer.io');

        if (!isAllowed) {
          alert("Preview can only load this project's local server.");
          setInputValue(currentUrl || "");
          return;
        }
      } catch (err) {
        // Invalid URL
        return;
      }
    }

    setCurrentUrl(urlToLoad);
    setInputValue(urlToLoad);
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden font-sans">
      {/* Browser Address Bar */}
      <div className="flex items-center gap-2 px-3 h-9 shrink-0 bg-sidebar border-b border-border">
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-foreground/70 hover:bg-sidebar-accent hover:text-foreground rounded-md"
            onClick={handleRefresh}
            disabled={!currentUrl}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        <form 
          onSubmit={handleNavigate}
          className="flex-1 flex items-center bg-background rounded-md border border-border h-[26px] px-2 overflow-hidden focus-within:ring-1 focus-within:ring-ring transition-all"
        >
          <Lock className="h-3 w-3 text-foreground/70 mr-2 shrink-0" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1 bg-transparent text-[11px] outline-none text-foreground font-mono"
            placeholder="No server running"
          />
        </form>

        <div className="flex items-center shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-foreground/70 hover:bg-sidebar-accent hover:text-foreground rounded-md"
            onClick={handleOpenExternal}
            disabled={!currentUrl}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
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

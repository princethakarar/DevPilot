"use client";

import React, { useEffect, useState, useRef } from "react";
import { Lock, RefreshCw, ExternalLink, Globe } from "lucide-react";
import { useIdeLayout } from "../hooks/useIdeLayout";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-col h-full bg-white rounded-md overflow-hidden shadow-sm border border-gray-200">
      {/* Browser Address Bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#f3f4f6] border-b border-gray-200">
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-gray-500 hover:bg-gray-200 rounded-md"
            onClick={handleRefresh}
            disabled={!currentUrl}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        <form 
          onSubmit={handleNavigate}
          className="flex-1 flex items-center bg-white rounded-md border border-gray-300 h-7 px-2 overflow-hidden shadow-inner"
        >
          <Lock className="h-3 w-3 text-gray-400 mr-2 shrink-0" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1 bg-transparent text-[13px] outline-none text-gray-700 font-sans"
            placeholder="No server running"
          />
        </form>

        <div className="flex items-center shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-gray-500 hover:bg-gray-200 rounded-md"
            onClick={handleOpenExternal}
            disabled={!currentUrl}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Iframe content */}
      <div className="flex-1 bg-white relative">
        {currentUrl ? (
          <iframe
            ref={iframeRef}
            src={currentUrl}
            className="w-full h-full border-none"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            allow="cross-origin-isolated"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <Globe className="h-16 w-16 mb-4 opacity-20" />
            <p className="text-sm font-medium text-gray-500">Preview not available</p>
            <p className="text-xs mt-2 text-gray-400 max-w-[250px] text-center">
              Run <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-600 font-mono">npm run dev</code> in the terminal to start the server.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

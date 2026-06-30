"use client";

import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@/lib/utils";
import { Terminal as TerminalIcon, Plus, X, Trash2 } from "lucide-react";
import { useIdeLayout } from "../hooks/useIdeLayout";

interface IdeTerminalProps {
  instance: any;
}

interface TerminalTab {
  id: string;
  title: string;
}

export function IdeTerminal({ instance }: IdeTerminalProps) {
  const { setDetectedServerUrl } = useIdeLayout();
  const [tabs, setTabs] = useState<TerminalTab[]>([{ id: "1", title: "jsh" }]);
  const [activeTabId, setActiveTabId] = useState("1");
  const nextTabId = useRef(2);
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  
  // Track terminal objects per tab
  const terminals = useRef<Record<string, { term: Terminal; fitAddon: FitAddon; process: any }>>({});

  const handleAddTab = () => {
    const id = String(nextTabId.current++);
    setTabs((prev) => [...prev, { id, title: "jsh" }]);
    setActiveTabId(id);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Kill process and dispose terminal
    const t = terminals.current[id];
    if (t) {
      if (t.process) t.process.kill();
      t.term.dispose();
      delete terminals.current[id];
    }

    setTabs((prev) => {
      const newTabs = prev.filter((tab) => tab.id !== id);
      if (activeTabId === id && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      }
      return newTabs;
    });
  };

  const handleClearActive = () => {
    const t = terminals.current[activeTabId];
    if (t) {
      t.term.clear();
    }
  };

  // Setup terminal for a tab when its container mounts
  const setupTerminal = async (id: string, container: HTMLDivElement) => {
    if (!instance || terminals.current[id]) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d8",
        cursor: "#d4d4d8",
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(container);
    fitAddon.fit();

    try {
      const process = await instance.spawn("jsh", [], {
        terminal: { cols: term.cols, rows: term.rows },
        cwd: "/",
      });

      // Pipe stdout to xterm
      process.output.pipeTo(
        new WritableStream({
          write(data) {
            term.write(data);

            // Server URL Detection
            const URL_PATTERNS = [
              /https?:\/\/localhost:\d+/,
              /Local:\s+(https?:\/\/\S+)/,
              /http:\/\/127\.0\.0\.1:\d+/,
            ];

            for (const pattern of URL_PATTERNS) {
              const match = data.match(pattern);
              if (match) {
                const url = match[1] || match[0];
                console.log("Detected server URL from terminal output:", url);
                setDetectedServerUrl(url);
                break;
              }
            }
          },
        })
      );

      // Pipe xterm input to process stdin
      const writer = process.input.getWriter();
      term.onData((data) => {
        writer.write(data);
      });

      terminals.current[id] = { term, fitAddon, process };

    } catch (err) {
      term.writeln("\r\n\x1b[31mFailed to start shell process\x1b[0m");
    }
  };

  // Handle ref assignment and terminal initialization
  const assignRef = (id: string, el: HTMLDivElement | null) => {
    containerRefs.current[id] = el;
    if (el && !terminals.current[id] && instance) {
      setupTerminal(id, el);
    }
  };

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      // Fit active terminal
      const t = terminals.current[activeTabId];
      if (t) {
        t.fitAddon.fit();
        if (t.process) {
          t.process.resize({ cols: t.term.cols, rows: t.term.rows });
        }
      }
    };

    window.addEventListener("resize", handleResize);
    
    // Setup a ResizeObserver for the container as well
    const observer = new ResizeObserver(() => {
      handleResize();
    });
    
    const currentContainer = containerRefs.current[activeTabId];
    if (currentContainer) {
      observer.observe(currentContainer);
    }

    // Call once when active tab changes
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
    };
  }, [activeTabId]);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-t border-[#2d2d2d] overflow-hidden">
      {/* Terminal Header */}
      <div className="flex h-9 bg-[#1e1e1e] items-center justify-between pr-2">
        <div className="flex h-full">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                "group relative flex items-center h-full px-3 gap-2 min-w-[120px] max-w-[200px] cursor-pointer",
                activeTabId === tab.id
                  ? "bg-[#1e1e1e] text-[#e2eaf4] border-t border-t-[#38bdf8]"
                  : "bg-[#1e1e1e] text-[#969696] hover:text-[#d4d4d8] border-t border-transparent"
              )}
            >
              <TerminalIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate text-xs select-none flex-1">
                {tab.title}
              </span>
              <button
                onClick={(e) => handleCloseTab(tab.id, e)}
                className="w-5 h-5 rounded hover:bg-[#333333] flex items-center justify-center opacity-0 group-hover:opacity-100 text-[#969696] hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={handleAddTab}
            className="w-8 h-8 flex items-center justify-center text-[#969696] hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex items-center">
          <button
            onClick={handleClearActive}
            title="Clear Terminal"
            className="w-7 h-7 rounded hover:bg-[#333333] flex items-center justify-center text-[#969696] hover:text-white transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Viewports */}
      <div className="flex-1 relative bg-[#1e1e1e] p-2">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={(el) => assignRef(tab.id, el)}
            className={cn(
              "absolute inset-2",
              activeTabId === tab.id ? "z-10 opacity-100" : "-z-10 opacity-0 pointer-events-none"
            )}
          />
        ))}
      </div>
    </div>
  );
}

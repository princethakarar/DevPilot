"use client";

import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { cn } from "@/lib/utils";
import { Terminal as TerminalIcon, Plus, X } from "lucide-react";
interface IdeTerminalProps {
  instance: any;
  projectName?: string;
}

interface TerminalTab {
  id: string;
  title: string;
}

/**
 * Length of the longest suffix of `str` that is also a (non-full-length) prefix
 * of `pattern` — i.e. how many trailing characters of `str` could still turn
 * into a match if more of `pattern` arrives in the next chunk.
 */
function partialMatchTailLength(str: string, pattern: string): number {
  const maxLen = Math.min(str.length, pattern.length - 1);
  for (let len = maxLen; len > 0; len--) {
    if (str.endsWith(pattern.slice(0, len))) return len;
  }
  return 0;
}

/**
 * Streaming replacer for the WebContainer's generated absolute home path
 * (e.g. "/home/u0xrvata8m4ov7iu20xphrd61m4sbm-rmmh"), which jsh prints verbatim
 * in its prompt. Only holds back characters when the tail of the current chunk
 * actually looks like the start of a split match — NOT a flat `home.length - 1`
 * on every write, which stalled ordinary single-character keystroke echo (each
 * character sat in the buffer since it never got remotely close to that
 * threshold, making typing feel laggy) until enough output piled up to flush.
 * Display-only: the shell still operates on the real path.
 */
function createHomePathFilter(home: string, alias: string) {
  let carry = "";
  return {
    push(chunk: string): string {
      if (!home) return chunk;
      const combined = carry + chunk;
      const replaced = combined.split(home).join(alias);
      const tail = partialMatchTailLength(replaced, home);
      if (tail === 0) {
        carry = "";
        return replaced;
      }
      carry = replaced.slice(replaced.length - tail);
      return replaced.slice(0, replaced.length - tail);
    },
    flush(): string {
      const rest = carry;
      carry = "";
      return rest;
    },
  };
}

export function IdeTerminal({ instance, projectName }: IdeTerminalProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>([{ id: "1", title: "jsh" }]);
  const [activeTabId, setActiveTabId] = useState("1");
  const nextTabId = useRef(2);
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Stable wrapper that xterm never mutates — safe to observe for resize
  // without risking a feedback loop against xterm's own DOM/scrollbar changes.
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Track terminal objects per tab
  const terminals = useRef<Record<string, { term: Terminal; fitAddon: FitAddon; process: any }>>({});

  // The WebContainer instance is cached globally and reused across different
  // playgrounds in the same tab (see useWebContainer.ts), so a shell process
  // started here (e.g. a manually-run `npm run dev`) would otherwise keep
  // running in the background after navigating away — still bound to its
  // port and still reachable — which is what let one project's dev server
  // bleed into another project's preview. Kill every tab's process on unmount
  // so leaving a playground actually stops what it was running.
  useEffect(() => {
    return () => {
      for (const t of Object.values(terminals.current)) {
        try { t.process?.kill(); } catch {}
        try { t.term.dispose(); } catch {}
      }
      terminals.current = {};
    };
  }, []);

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

  // Setup terminal for a tab when its container mounts
  const setupTerminal = async (id: string, container: HTMLDivElement) => {
    if (!instance || terminals.current[id]) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'var(--font-mono), monospace',
      fontSize: 13,
      lineHeight: 1.2,
      allowTransparency: true,
      theme: {
        background: "transparent",
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(container);

    // jsh is WebContainer's own minimal POSIX-ish shell, not a real Linux
    // userland — there's no package manager underneath it to install real
    // coreutils, so grep/find/wc/etc. genuinely don't exist here (by
    // platform design, not a bug). node, npm, and git work. One-time notice
    // on the first tab only — repeating it on every new tab would be noise.
    if (id === "1") {
      term.writeln(
        "\x1b[2mjsh is a sandboxed shell — node, npm, and git work, but Unix utilities like grep/find/wc aren't available. Use the file explorer's search or the AI agent for text search instead.\x1b[0m"
      );
    }

    // Let the container/font finish laying out before the first fit — fitting
    // against a not-yet-stable box is what desyncs the PTY's column count from
    // the visual width and causes wrapped/duplicated text once output streams in.
    if (document.fonts?.ready) {
      try { await document.fonts.ready; } catch {}
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    fitAddon.fit();

    try {
      const process = await instance.spawn("jsh", [], {
        terminal: { cols: term.cols, rows: term.rows },
        cwd: "/",
      });

      const home: string = instance.workdir || "";
      const alias = `~/${(projectName || "project").trim()}`;
      const pathFilter = createHomePathFilter(home, alias);

      // Pipe stdout to xterm, aliasing the generated home path to the project name
      process.output.pipeTo(
        new WritableStream({
          write(data: string) {
            term.write(pathFilter.push(data));
          },
          close() {
            const rest = pathFilter.flush();
            if (rest) term.write(rest);
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
    let rafId = 0;

    const fitActive = () => {
      const t = terminals.current[activeTabId];
      if (!t) return;
      try {
        t.fitAddon.fit();
      } catch {
        return;
      }
      if (t.process) {
        t.process.resize({ cols: t.term.cols, rows: t.term.rows });
      }
    };

    // Coalesce bursts of resize notifications (drag-resize, layout thrashing)
    // into a single fit+PTY-resize per frame, instead of resizing the PTY
    // mid-write for every intermediate event.
    const scheduleFit = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(fitActive);
    };

    window.addEventListener("resize", scheduleFit);

    // Observe the stable outer viewport wrapper, not the per-tab div xterm
    // renders into — observing xterm's own mount point can cause a resize
    // feedback loop as its internal scrollbar/rows mutate that element.
    const observer = new ResizeObserver(scheduleFit);
    if (viewportRef.current) {
      observer.observe(viewportRef.current);
    }

    scheduleFit();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleFit);
      observer.disconnect();
    };
  }, [activeTabId]);

  return (
    <div className="flex flex-col h-full bg-background border-t border-border overflow-hidden font-sans">
      {/* Terminal Header */}
      <div className="flex h-9 bg-sidebar items-center pr-2">
        <div className="flex h-full">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                "group relative flex items-center h-full px-3 gap-2 min-w-[120px] max-w-[200px] cursor-pointer transition-colors",
                activeTabId === tab.id
                  ? "bg-background text-foreground border-t-2 border-t-primary"
                  : "bg-sidebar text-foreground/70 hover:text-foreground hover:bg-sidebar-accent/50 border-t-2 border-transparent"
              )}
            >
              <TerminalIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate text-xs select-none flex-1">
                {tab.title}
              </span>
              <button
                onClick={(e) => handleCloseTab(tab.id, e)}
                className="w-5 h-5 rounded hover:bg-foreground/20 flex items-center justify-center opacity-0 group-hover:opacity-100 text-foreground/70 hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={handleAddTab}
            className="w-8 h-8 flex items-center justify-center text-foreground/70 hover:text-foreground hover:bg-sidebar-accent/50 rounded transition-colors ml-1"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Viewports */}
      <div ref={viewportRef} className="flex-1 relative min-h-0 bg-background p-2">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={(el) => assignRef(tab.id, el)}
            className={cn(
              "absolute inset-0",
              activeTabId === tab.id ? "z-10 opacity-100" : "-z-10 opacity-0 pointer-events-none"
            )}
          />
        ))}
      </div>
    </div>
  );
}

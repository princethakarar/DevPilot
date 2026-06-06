"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const AI_RESPONSES: Record<string, string> = {
  default: `Sure! Here's a rate limiter in TypeScript:

\`\`\`ts
import { Request, Response, NextFunction } from 'express';

const rateLimiter = (max = 100, windowMs = 60000) => {
  const hits = new Map<string, number[]>();
  
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? 'unknown';
    const now = Date.now();
    const times = (hits.get(ip) ?? [])
      .filter(t => now - t < windowMs);
    
    if (times.length >= max) {
      return res.status(429).json({ 
        error: 'Too Many Requests' 
      });
    }
    hits.set(ip, [...times, now]);
    next();
  };
};

export default rateLimiter;
\`\`\`

Usage: \`app.use(rateLimiter(100, 60000))\``,
  explain: `This code uses a sliding window algorithm. For each IP, it stores an array of timestamps and filters out those older than the window — giving a "rolling" 60-second limit rather than a fixed-interval one.`,
  test: `Here are Jest tests for the rate limiter:

test('allows under limit', async () => {
  const res = await request(app).get('/');
  expect(res.status).not.toBe(429);
});

test('blocks over limit', async () => {
  for(let i = 0; i < 101; i++)
    await request(app).get('/');
  const res = await request(app).get('/');
  expect(res.status).toBe(429);
});`,
};

function typeText(el: HTMLElement, text: string, speed: number, onDone?: () => void) {
  el.textContent = "";
  let i = 0;
  const tick = () => {
    if (i < text.length) {
      el.textContent += text[i++];
      el.closest(".chat-body-scroll")?.scrollTo(0, 99999);
      setTimeout(tick, speed);
    } else {
      onDone?.();
    }
  };
  tick();
}

export default function ChatDemo() {
  const bodyRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [started, setStarted] = useState(false);

  const startTyping = useCallback(() => {
    if (started) return;
    setStarted(true);
    setTimeout(() => {
      if (bubbleRef.current && statusRef.current) {
        typeText(bubbleRef.current, AI_RESPONSES.default, 8, () => {
          if (statusRef.current) statusRef.current.textContent = "just now";
        });
      }
    }, 600);
  }, [started]);

  // Auto-start when visible
  useEffect(() => {
    const el = bodyRef.current?.closest("section");
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          startTyping();
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [startTyping]);

  const sendMessage = () => {
    const val = inputRef.current?.value.trim();
    if (!val || !bodyRef.current) return;
    inputRef.current!.value = "";

    // User message
    const userDiv = document.createElement("div");
    userDiv.className = "flex justify-end gap-2.5";
    userDiv.innerHTML = `<div><div class="font-jetbrains px-3.5 py-2.5 rounded-[10px] text-[12.5px] leading-relaxed max-w-[82%] bg-[rgba(0,90,160,0.35)] border border-[rgba(0,180,255,0.2)] text-[#e8f4ff]">${val}</div><div class="font-jetbrains text-[10px] text-[#3a6080] mt-1 text-right">You · just now</div></div>`;
    bodyRef.current.appendChild(userDiv);
    bodyRef.current.scrollTop = 99999;

    // AI response
    const aiDiv = document.createElement("div");
    aiDiv.className = "flex gap-2.5";
    const bubble = document.createElement("div");
    bubble.className = "font-jetbrains px-3.5 py-2.5 rounded-[10px] text-[12.5px] leading-relaxed max-w-[82%] bg-[rgba(30,10,50,0.5)] border border-[rgba(166,123,212,0.2)] text-[#e8f4ff] whitespace-pre-wrap";
    const meta = document.createElement("div");
    meta.className = "font-jetbrains text-[10px] text-[#3a6080] mt-1";
    meta.textContent = "DevPilot · thinking...";

    aiDiv.innerHTML = `<div class="w-7 h-7 shrink-0 rounded-full bg-[rgba(0,180,255,0.1)] border border-[rgba(0,180,255,0.2)] flex items-center justify-center mt-0.5"><svg width="16" height="16" viewBox="0 0 80 80" fill="none"><defs><linearGradient id="cg2" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse"><stop stop-color="#00d4ff"/><stop offset="1" stop-color="#a67bd4"/></linearGradient></defs><polygon points="40,4 72,60 8,60" fill="url(#cg2)"/><circle cx="40" cy="38" r="9" fill="#fff" opacity="0.9"/><circle cx="40" cy="38" r="4.5" fill="url(#cg2)"/></svg></div>`;
    const wrap = document.createElement("div");
    wrap.appendChild(bubble);
    wrap.appendChild(meta);
    aiDiv.appendChild(wrap);
    bodyRef.current.appendChild(aiDiv);
    bodyRef.current.scrollTop = 99999;

    const lv = val.toLowerCase();
    let resp: string;
    if (lv.includes("explain") || lv.includes("how")) resp = AI_RESPONSES.explain;
    else if (lv.includes("test")) resp = AI_RESPONSES.test;
    else resp = `Got it! Analysing your request: "${val}"...\n\nI'll process your codebase context and generate the best solution. This feature is powered by full-repo awareness.`;

    setTimeout(() => {
      typeText(bubble, resp, 10, () => { meta.textContent = "DevPilot · just now"; });
    }, 700);
  };

  return (
    <div className="bg-[#06101e] border border-[rgba(0,180,255,0.18)] rounded-[14px] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[rgba(0,0,0,0.3)] border-b border-[rgba(255,255,255,0.05)]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#00b4ff] shadow-[0_0_8px_#00b4ff] animate-[landing-pulse_2s_infinite]" />
          <span className="font-jetbrains text-[11px] text-[#7ca8cc] tracking-[0.12em]">DEVPILOT AI</span>
        </div>
        <span className="font-jetbrains text-[10px] text-[#3a6080]">claude-3.5 · gpt-4o</span>
      </div>
      {/* Body */}
      <div ref={bodyRef} className="chat-body-scroll px-4 py-5 flex flex-col gap-4 min-h-[280px] max-h-[340px] overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-[#1a5faa]">
        <div className="flex justify-end gap-2.5">
          <div>
            <div className="font-jetbrains px-3.5 py-2.5 rounded-[10px] text-[12.5px] leading-relaxed max-w-[82%] bg-[rgba(0,90,160,0.35)] border border-[rgba(0,180,255,0.2)] text-[#e8f4ff]">
              Write a rate limiter middleware in TypeScript
            </div>
            <div className="font-jetbrains text-[10px] text-[#3a6080] mt-1 text-right">You · just now</div>
          </div>
        </div>
        <div className="flex gap-2.5">
          <div className="w-7 h-7 shrink-0 rounded-full bg-[rgba(0,180,255,0.1)] border border-[rgba(0,180,255,0.2)] flex items-center justify-center mt-0.5">
            <svg width="16" height="16" viewBox="0 0 80 80" fill="none"><defs><linearGradient id="cg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse"><stop stopColor="#00d4ff"/><stop offset="1" stopColor="#a67bd4"/></linearGradient></defs><polygon points="40,4 72,60 8,60" fill="url(#cg)"/><circle cx="40" cy="38" r="9" fill="#fff" opacity="0.9"/><circle cx="40" cy="38" r="4.5" fill="url(#cg)"/></svg>
          </div>
          <div>
            <div ref={bubbleRef} className="font-jetbrains px-3.5 py-2.5 rounded-[10px] text-[12.5px] leading-relaxed max-w-[82%] bg-[rgba(30,10,50,0.5)] border border-[rgba(166,123,212,0.2)] text-[#e8f4ff] whitespace-pre-wrap" />
            <div className="font-jetbrains text-[10px] text-[#3a6080] mt-1">DevPilot · <span ref={statusRef}>thinking...</span></div>
          </div>
        </div>
      </div>
      {/* Input */}
      <div className="flex gap-2 px-3.5 py-3 border-t border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.2)]">
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask DevPilot anything..."
          autoComplete="off"
          className="font-jetbrains flex-1 bg-[rgba(255,255,255,0.04)] border border-[rgba(0,180,255,0.15)] rounded-lg px-3.5 py-2 text-[#e8f4ff] text-[12px] outline-none focus:border-[rgba(0,180,255,0.4)] transition-colors cursor-none"
          onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
        />
        <button
          onClick={sendMessage}
          className="w-9 h-9 rounded-lg bg-[rgba(0,180,255,0.15)] border border-[rgba(0,180,255,0.3)] text-[#00b4ff] flex items-center justify-center hover:bg-[rgba(0,180,255,0.28)] transition-colors cursor-none"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  );
}

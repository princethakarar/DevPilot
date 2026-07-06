"use client";

import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
}

const AI_RESPONSES: Record<string, string> = {
  default: `Sure! Here's a rate limiter middleware in TypeScript:

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

\`\`\`ts
test('allows under limit', async () => {
  const res = await request(app).get('/');
  expect(res.status).not.toBe(429);
});

test('blocks over limit', async () => {
  for(let i = 0; i < 101; i++)
    await request(app).get('/');
  const res = await request(app).get('/');
  expect(res.status).toBe(429);
});
\`\`\``,
};

export default function ChatDemo() {
  const bodyRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [typingText, setTypingText] = useState("");
  const [isAutoplay, setIsAutoplay] = useState(true);
  const [isFading, setIsFading] = useState(false);

  // Auto scroll to bottom
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, typingText, isThinking]);

  // Autoplay scenario loop
  useEffect(() => {
    if (!isAutoplay) return;

    let active = true;
    let timer: NodeJS.Timeout | null = null;

    const delay = (ms: number) => new Promise<void>((r) => { timer = setTimeout(r, ms); });

    const simulateTypeInput = async (text: string) => {
      setInputText("");
      for (let i = 0; i < text.length; i++) {
        if (!active || !isAutoplay) return;
        setInputText((prev) => prev + text[i]);
        await delay(40 + Math.random() * 30);
      }
      await delay(800);
    };

    const simulateTypeAi = async (text: string) => {
      setTypingText("");
      for (let i = 0; i < text.length; i++) {
        if (!active || !isAutoplay) return;
        setTypingText((prev) => prev + text[i]);
        await delay(12);
      }
      setTypingText("");
    };

    const runLoop = async () => {
      // initial brief delay on mount
      await delay(1000);

      while (active && isAutoplay) {
        // Step 1: Type user prompt 1
        await simulateTypeInput("Write a rate limiter middleware in TypeScript");
        if (!active || !isAutoplay) return;
        setInputText("");
        setMessages((prev) => [...prev, { id: "u1", sender: "user", text: "Write a rate limiter middleware in TypeScript", timestamp: "just now" }]);

        // Step 2: Thinking
        setIsThinking(true);
        await delay(1200);
        setIsThinking(false);

        // Step 3: Type AI response 1
        if (!active || !isAutoplay) return;
        await simulateTypeAi(AI_RESPONSES.default);
        if (!active || !isAutoplay) return;
        setMessages((prev) => [...prev, { id: "a1", sender: "ai", text: AI_RESPONSES.default, timestamp: "just now" }]);

        // Pause
        await delay(3500);

        // Step 4: Type user prompt 2
        if (!active || !isAutoplay) return;
        await simulateTypeInput("Explain how it works");
        if (!active || !isAutoplay) return;
        setInputText("");
        setMessages((prev) => [...prev, { id: "u2", sender: "user", text: "Explain how it works", timestamp: "just now" }]);

        // Step 5: Thinking
        setIsThinking(true);
        await delay(1000);
        setIsThinking(false);

        // Step 6: Type AI response 2
        if (!active || !isAutoplay) return;
        await simulateTypeAi(AI_RESPONSES.explain);
        if (!active || !isAutoplay) return;
        setMessages((prev) => [...prev, { id: "a2", sender: "ai", text: AI_RESPONSES.explain, timestamp: "just now" }]);

        // Pause
        await delay(3500);

        // Step 7: Type user prompt 3
        if (!active || !isAutoplay) return;
        await simulateTypeInput("Write a unit test for this");
        if (!active || !isAutoplay) return;
        setInputText("");
        setMessages((prev) => [...prev, { id: "u3", sender: "user", text: "Write a unit test for this", timestamp: "just now" }]);

        // Step 8: Thinking
        setIsThinking(true);
        await delay(1000);
        setIsThinking(false);

        // Step 9: Type AI response 3
        if (!active || !isAutoplay) return;
        await simulateTypeAi(AI_RESPONSES.test);
        if (!active || !isAutoplay) return;
        setMessages((prev) => [...prev, { id: "a3", sender: "ai", text: AI_RESPONSES.test, timestamp: "just now" }]);

        // Long pause before resetting loop
        await delay(8000);

        // Reset with a clean fade animation
        if (!active || !isAutoplay) return;
        setIsFading(true);
        await delay(800);
        setMessages([]);
        setIsFading(false);
        await delay(500);
      }
    };

    runLoop();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [isAutoplay]);

  const handleUserType = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsAutoplay(false);
    setInputText(e.target.value);
  };

  const handleUserSubmit = () => {
    if (!inputText.trim()) return;
    setIsAutoplay(false);
    const userMsg = inputText.trim();
    setInputText("");

    setMessages((prev) => [...prev, { id: `u-manual-${Date.now()}`, sender: "user", text: userMsg, timestamp: "just now" }]);

    setIsThinking(true);
    setTimeout(() => {
      setIsThinking(false);

      const lv = userMsg.toLowerCase();
      let respText = "";
      if (lv.includes("explain") || lv.includes("how")) {
        respText = AI_RESPONSES.explain;
      } else if (lv.includes("test")) {
        respText = AI_RESPONSES.test;
      } else {
        respText = `Got it! Analyzing "${userMsg}"...\n\nI've searched your codebase and mapped relevant contexts. Let me know if you want me to write code or test files for this.`;
      }

      let currentTypeIndex = 0;
      const typeInterval = setInterval(() => {
        setTypingText((prev) => prev + respText[currentTypeIndex]);
        currentTypeIndex++;
        if (currentTypeIndex >= respText.length) {
          clearInterval(typeInterval);
          setMessages((prev) => [...prev, { id: `a-manual-${Date.now()}`, sender: "ai", text: respText, timestamp: "just now" }]);
          setTypingText("");
        }
      }, 12);
    }, 1000);
  };

  return (
    <div className="bg-[#06101e] border border-[rgba(0,180,255,0.18)] rounded-[14px] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col h-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 bg-[rgba(0,0,0,0.3)] border-b border-[rgba(255,255,255,0.05)]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#00b4ff] shadow-[0_0_8px_#00b4ff] animate-[landing-pulse_2s_infinite]" />
          <span className="font-jetbrains text-[11px] text-[#7ca8cc] tracking-[0.12em]">DEVPILOT AI</span>
        </div>
        <span className="font-jetbrains text-[10px] text-[#3a6080]">llama-3.3-70b-versatile</span>
      </div>

      {/* Body */}
      <div 
        ref={bodyRef} 
        className="chat-body-scroll px-4 py-5 flex-1 flex flex-col gap-4 overflow-hidden transition-opacity duration-500"
        style={{ opacity: isFading ? 0 : 1 }}
      >
        {messages.length === 0 && !typingText && !isThinking && (
          <div className="flex-1 flex items-center justify-center">
            <span className="font-jetbrains text-[11px] text-[#3a6080] italic">Ask anything to begin pair programming...</span>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"} gap-2.5`}>
            {m.sender === "ai" && (
              <div className="w-7 h-7 shrink-0 rounded-full bg-[rgba(0,180,255,0.1)] border border-[rgba(0,180,255,0.2)] flex items-center justify-center mt-0.5">
                <img src="/icon-bg-removed.png" alt="DevPilot" className="w-4 h-4 object-contain" />
              </div>
            )}
            <div className={m.sender === "user" ? "max-w-[85%]" : "max-w-[85%] flex-1"}>
              <div 
                className={`font-jetbrains px-3.5 py-2.5 rounded-[10px] text-[12px] leading-relaxed whitespace-pre-wrap ${
                  m.sender === "user" 
                    ? "bg-[rgba(0,90,160,0.35)] border border-[rgba(0,180,255,0.2)] text-[#e8f4ff]" 
                    : "bg-[rgba(30,10,50,0.5)] border border-[rgba(166,123,212,0.2)] text-[#e8f4ff]"
                }`}
              >
                {m.text}
              </div>
              <div className={`font-jetbrains text-[9px] text-[#3a6080] mt-1 ${m.sender === "user" ? "text-right" : ""}`}>
                {m.sender === "user" ? "You" : "DevPilot"} · {m.timestamp}
              </div>
            </div>
          </div>
        ))}

        {/* Typing Response */}
        {typingText && (
          <div className="flex justify-start gap-2.5">
            <div className="w-7 h-7 shrink-0 rounded-full bg-[rgba(0,180,255,0.1)] border border-[rgba(0,180,255,0.2)] flex items-center justify-center mt-0.5">
              <img src="/icon-bg-removed.png" alt="DevPilot" className="w-4 h-4 object-contain" />
            </div>
            <div className="max-w-[85%] flex-1">
              <div className="font-jetbrains px-3.5 py-2.5 rounded-[10px] text-[12px] leading-relaxed bg-[rgba(30,10,50,0.5)] border border-[rgba(166,123,212,0.2)] text-[#e8f4ff] whitespace-pre-wrap">
                {typingText}
                <span className="inline-block w-1.5 h-3.5 bg-[#00b4ff] ml-1 align-middle animate-[landing-blink_0.8s_infinite]"/>
              </div>
              <div className="font-jetbrains text-[9px] text-[#3a6080] mt-1">DevPilot · typing...</div>
            </div>
          </div>
        )}

        {/* Thinking State */}
        {isThinking && (
          <div className="flex justify-start gap-2.5">
            <div className="w-7 h-7 shrink-0 rounded-full bg-[rgba(0,180,255,0.1)] border border-[rgba(0,180,255,0.2)] flex items-center justify-center mt-0.5">
              <img src="/icon-bg-removed.png" alt="DevPilot" className="w-4 h-4 object-contain" />
            </div>
            <div>
              <div className="font-jetbrains px-4 py-3 rounded-[10px] bg-[rgba(30,10,50,0.5)] border border-[rgba(166,123,212,0.2)] text-[#7ca8cc] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00b4ff] animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#00b4ff] animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#00b4ff] animate-bounce" />
              </div>
              <div className="font-jetbrains text-[9px] text-[#3a6080] mt-1">DevPilot · thinking...</div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2 px-3.5 py-3 border-t border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.2)]">
        <input
          suppressHydrationWarning
          type="text"
          value={inputText}
          onChange={handleUserType}
          placeholder="Ask DevPilot anything..."
          autoComplete="off"
          className="font-jetbrains flex-1 bg-[rgba(255,255,255,0.04)] border border-[rgba(0,180,255,0.15)] rounded-lg px-3.5 py-2 text-[#e8f4ff] text-[12px] outline-none focus:border-[rgba(0,180,255,0.4)] transition-colors cursor-none"
          onKeyDown={(e) => { if (e.key === "Enter") handleUserSubmit(); }}
        />
        <button
          suppressHydrationWarning
          onClick={handleUserSubmit}
          className="w-9 h-9 rounded-lg bg-[rgba(0,180,255,0.15)] border border-[rgba(0,180,255,0.3)] text-[#00b4ff] flex items-center justify-center hover:bg-[rgba(0,180,255,0.28)] transition-colors cursor-none"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

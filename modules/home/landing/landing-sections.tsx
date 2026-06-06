"use client";
import Link from "next/link";
import Image from "next/image";
import ChatDemo from "./chat-demo";
import { useEffect, useRef, useState } from "react";

const FEATURES = [
  { icon: "ai", name: "AI Coding Assistant", desc: "Get real-time inline code completions and an intelligent chat assistant to explain, debug, or refactor code through natural chat.", tag: "Llama 3.3 70B" },
  { icon: "collab", name: "Real-time Collaboration", desc: "Work simultaneously on a single project with your team. Code multiplayer-style with live cursor updates and shared terminals.", tag: "Multiplayer" },
  { icon: "github", name: "GitHub Repo Open", desc: "Directly open any project from your connected GitHub — branches, history, CI status all visible.", tag: "One Click" },
  { icon: "setup", name: "Instant Project Setup", desc: "Zero config. Any stack. Containers spin up in seconds, pre-configured with the right tools.", tag: "Zero Config" },
  { icon: "preview", name: "Live App Preview", desc: "See your changes render in real time. Embedded browser with hot-reload directly inside the IDE.", tag: "Hot Reload" },
  { icon: "cloud", name: "Portable & Cloud-Native", desc: "Your entire dev environment lives in the cloud. Access it from any device, anywhere.", tag: "Any Device" },
];

function renderFeatureIcon(iconKey: string) {
  switch (iconKey) {
    case "ai":
      return (
        <svg className="w-6 h-6 text-[#00b4ff]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
    case "collab":
      return (
        <svg className="w-6 h-6 text-[#00b4ff]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="16" y1="11" x2="22" y2="11" />
        </svg>
      );
    case "github":
      return (
        <svg className="w-6 h-6 text-[#00b4ff]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
        </svg>
      );
    case "setup":
      return (
        <svg className="w-6 h-6 text-[#00b4ff]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
          <line x1="6" y1="6" x2="6.01" y2="6" />
          <line x1="6" y1="18" x2="6.01" y2="18" />
        </svg>
      );
    case "preview":
      return (
        <svg className="w-6 h-6 text-[#00b4ff]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <line x1="12" y1="21" x2="12" y2="17" />
          <line x1="8" y1="21" x2="16" y2="21" />
        </svg>
      );
    case "cloud":
      return (
        <svg className="w-6 h-6 text-[#00b4ff]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
          <line x1="8" y1="16" x2="8.01" y2="16" />
          <line x1="8" y1="20" x2="8.01" y2="20" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
          <line x1="16" y1="16" x2="16.01" y2="16" />
          <line x1="16" y1="20" x2="16.01" y2="20" />
        </svg>
      );
    default:
      return null;
  }
}
const STEPS = [
  { n: "01", t: "Open Repo", d: "Directly open any project from your connected GitHub. Your full project loads instantly — branches, files, and config ready to go." },
  { n: "02", t: "Code with AI", d: "Write code with real-time inline suggestions and chat assistance powered by AI." },
  { n: "03", t: "Live Preview", d: "See your changes render instantly in an embedded browser with hot-reload." },
  { n: "04", t: "Push to GitHub", d: "Commit and push your changes directly to GitHub from inside the IDE." },
];
const TECHS = ["React", "Express", "Next.js", "Angular", "Hono", "Vue"];

function CodeSuggestDemo() {
  const [typedChars, setTypedChars] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pause" | "ghost" | "accept" | "extra" | "fade">("typing");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const userText = "handle_request";
  const partialPrefix = "hand";

  useEffect(() => {
    let cancelled = false;

    const delay = (ms: number) => new Promise<void>((r) => { timerRef.current = setTimeout(r, ms); });

    const runCycle = async () => {
      // Phase 1: type "le_request" character by character
      setPhase("typing");
      for (let i = 0; i <= userText.length - partialPrefix.length; i++) {
        if (cancelled) return;
        setTypedChars(i);
        await delay(75 + Math.random() * 45);
      }

      // Phase 2: brief pause with cursor blinking
      if (cancelled) return;
      setPhase("pause");
      await delay(900);

      // Phase 3: ghost suggestions fade in
      if (cancelled) return;
      setPhase("ghost");
      await delay(2400);

      // Phase 4: accept — ghost becomes solid
      if (cancelled) return;
      setPhase("accept");
      await delay(1200);

      // Phase 5: extra lines appear
      if (cancelled) return;
      setPhase("extra");
      await delay(3500);

      // Phase 6: fade out and reset
      if (cancelled) return;
      setPhase("fade");
      await delay(800);

      if (cancelled) return;
      setTypedChars(0);
      setPhase("typing");
      runCycle();
    };

    runCycle();
    return () => { cancelled = true; if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const displayedSuffix = userText.slice(partialPrefix.length, partialPrefix.length + typedChars);
  const showCursor = phase === "typing" || phase === "pause";
  const showGhost = phase === "ghost" || phase === "accept" || phase === "extra" || phase === "fade";
  const ghostAccepted = phase === "accept" || phase === "extra" || phase === "fade";
  const showExtra = phase === "extra" || phase === "fade";
  const isFading = phase === "fade";

  return (
    <div className="bg-[#07111f] border border-[rgba(0,180,255,0.15)] rounded-xl overflow-hidden shadow-[0_20px_80px_rgba(0,0,0,0.5)] w-full">
      <div className="flex items-center gap-2 px-4 py-3 bg-[rgba(0,0,0,0.3)] border-b border-[rgba(255,255,255,0.05)]">
        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]"/><div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"/><div className="w-2.5 h-2.5 rounded-full bg-[#28c840]"/>
        <span className="font-jetbrains text-[11px] text-[#7ca8cc] ml-2">api_handler.py</span>
        {showGhost && (
          <span className="ml-auto font-jetbrains text-[9px] text-[#00b4ff] tracking-wider opacity-60">
            {ghostAccepted ? "✓ Accepted" : "AI ✦ Suggesting..."}
          </span>
        )}
      </div>
      <div
        className="font-jetbrains p-6 text-[12.5px] leading-[1.8] h-[345px] relative"
        style={{ opacity: isFading ? 0 : 1, transition: "opacity 0.7s ease" }}
      >
        {/* Line 1 */}
        <div>
          <span className="text-[#3a6080] mr-5 select-none text-[11px]">1</span>
          <span className="text-[#546e7a] italic"># DevPilot AI — auto-analyzing context...</span>
        </div>
        {/* Line 2 */}
        <div>
          <span className="text-[#3a6080] mr-5 select-none text-[11px]">2</span>
        </div>
        {/* Line 3 */}
        <div>
          <span className="text-[#3a6080] mr-5 select-none text-[11px]">3</span>
          <span className="text-[#c792ea]">import</span> <span className="text-[#82aaff]">asyncio</span>
        </div>
        {/* Line 4 */}
        <div>
          <span className="text-[#3a6080] mr-5 select-none text-[11px]">4</span>
          <span className="text-[#c792ea]">from</span> <span className="text-[#82aaff]">devpilot</span> <span className="text-[#c792ea]">import</span> AI, Context
        </div>
        {/* Line 5 */}
        <div>
          <span className="text-[#3a6080] mr-5 select-none text-[11px]">5</span>
        </div>
        {/* Line 6 — typing line */}
        <div>
          <span className="text-[#3a6080] mr-5 select-none text-[11px]">6</span>
          <span className="text-[#c792ea]">async def</span>{" "}
          <span className="text-[#82aaff]">{partialPrefix}{displayedSuffix}</span>
          {typedChars >= userText.length - partialPrefix.length && <span className="text-[#e8f4ff]">(req):</span>}
          {showCursor && (
            <span className="inline-block w-0.5 h-3.5 bg-[#00b4ff] align-middle animate-[landing-blink_0.8s_infinite] ml-px"/>
          )}
        </div>

        {/* Ghost / Accepted suggestion lines */}
        {showGhost && (
          <>
            <div
              className="relative"
              style={{
                opacity: ghostAccepted ? 1 : 0.45,
                background: ghostAccepted ? "rgba(0,180,255,0.06)" : "transparent",
                borderLeft: ghostAccepted ? "2px solid #00b4ff" : "2px solid transparent",
                marginLeft: "-24px",
                paddingLeft: "22px",
                transition: "all 0.5s ease",
              }}
            >
              <span className="text-[#3a6080] mr-5 select-none text-[11px]">7</span>
              <span style={{ color: ghostAccepted ? "#e8f4ff" : "#7ca8cc", fontStyle: ghostAccepted ? "normal" : "italic", transition: "all 0.5s ease" }}>
                {ghostAccepted ? <><span className="text-[#e8f4ff]">&nbsp;&nbsp;&nbsp;&nbsp;ctx</span> = <span className="text-[#82aaff]">Context</span>.from_req(req)</> : "    ctx = Context.from_req(req)"}
              </span>
              {!ghostAccepted && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 bg-[rgba(0,180,255,0.15)] border border-[rgba(0,180,255,0.3)] rounded text-[9px] px-1.5 py-0.5 text-[#00b4ff]"
                  style={{ animation: "landing-pulse 2s infinite" }}
                >
                  Tab ↹
                </span>
              )}
            </div>

            <div
              style={{
                opacity: ghostAccepted ? 1 : 0.45,
                background: ghostAccepted ? "rgba(0,180,255,0.06)" : "transparent",
                borderLeft: ghostAccepted ? "2px solid #00b4ff" : "2px solid transparent",
                marginLeft: "-24px",
                paddingLeft: "22px",
                transition: "all 0.5s ease",
              }}
            >
              <span className="text-[#3a6080] mr-5 select-none text-[11px]">8</span>
              <span style={{ color: ghostAccepted ? "#e8f4ff" : "#7ca8cc", fontStyle: ghostAccepted ? "normal" : "italic", transition: "all 0.5s ease" }}>
                {ghostAccepted ? <><span className="text-[#e8f4ff]">&nbsp;&nbsp;&nbsp;&nbsp;result</span> = <span className="text-[#c792ea]">await</span> <span className="text-[#82aaff]">AI</span>.suggest(ctx)</> : "    result = await AI.suggest(ctx)"}
              </span>
            </div>

            <div
              style={{
                opacity: ghostAccepted ? 1 : 0.45,
                background: ghostAccepted ? "rgba(0,180,255,0.06)" : "transparent",
                borderLeft: ghostAccepted ? "2px solid #00b4ff" : "2px solid transparent",
                marginLeft: "-24px",
                paddingLeft: "22px",
                transition: "all 0.5s ease",
              }}
            >
              <span className="text-[#3a6080] mr-5 select-none text-[11px]">9</span>
              <span style={{ color: ghostAccepted ? "#e8f4ff" : "#7ca8cc", fontStyle: ghostAccepted ? "normal" : "italic", transition: "all 0.5s ease" }}>
                {ghostAccepted ? (
                  <><span className="text-white">&nbsp;&nbsp;&nbsp;&nbsp;</span><span className="text-[#c792ea]">return</span> {"{"}<span className="text-[#c3e88d]">&quot;data&quot;</span>: result, <span className="text-[#c3e88d]">&quot;ok&quot;</span>: <span className="text-[#c792ea]">True</span>{"}"}</>
                ) : '    return {"data": result, "ok": True}'}
              </span>
            </div>
          </>
        )}

        {/* Extra lines after accept */}
        {showExtra && (
          <>
            <div style={{ opacity: 0, animation: "landing-fadeUp 0.4s 0.1s forwards" }}>
              <span className="text-[#3a6080] mr-5 select-none text-[11px]">10</span>
            </div>
            <div style={{ opacity: 0, animation: "landing-fadeUp 0.4s 0.25s forwards" }}>
              <span className="text-[#3a6080] mr-5 select-none text-[11px]">11</span>
              <span className="text-[#546e7a] italic">&nbsp;&nbsp;&nbsp;&nbsp;# refining response...</span>
            </div>
            <div style={{ opacity: 0, animation: "landing-fadeUp 0.4s 0.4s forwards" }}>
              <span className="text-[#3a6080] mr-5 select-none text-[11px]">12</span>
              <span className="inline-block w-0.5 h-3.5 bg-[#00b4ff] align-middle animate-[landing-blink_0.8s_infinite]"/>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function renderPillIcon(key: string) {
  switch (key) {
    case "code":
      return (
        <svg className="w-3.5 h-3.5 text-[#00b4ff]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      );
    case "search":
      return (
        <svg className="w-3.5 h-3.5 text-[#a67bd4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case "bug":
      return (
        <svg className="w-3.5 h-3.5 text-[#ff5f57]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9a6 6 0 0 1 12 0v4a6 6 0 0 1-12 0v-4z" />
          <path d="M12 3v6" />
          <path d="M3 12h18" />
          <path d="M18 6l-2 2M6 6l2 2" />
          <path d="M18 16l2 2M6 16l-2 2" />
        </svg>
      );
    case "test":
      return (
        <svg className="w-3.5 h-3.5 text-[#28c840]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "refactor":
      return (
        <svg className="w-3.5 h-3.5 text-[#eab308]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
      );
    case "docs":
      return (
        <svg className="w-3.5 h-3.5 text-[#7ca8cc]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    default:
      return null;
  }
}

export default function LandingSections() {
  const featRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          (e.target as HTMLElement).style.opacity = "1";
          (e.target as HTMLElement).style.transform = "translateY(0)";
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll(".reveal-item").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <>
      {/* FEATURES */}
      <section id="features" className="py-24 px-10 max-w-[1200px] mx-auto">
        <div className="font-jetbrains text-[11px] tracking-[0.3em] text-[#00b4ff] uppercase mb-4 flex items-center gap-3">
          <span className="opacity-50">{"//"}</span> Core Capabilities
        </div>
        <h2 className="text-[clamp(32px,4vw,52px)] font-extrabold leading-tight mb-5">Everything you need.<br/><span className="text-[#00b4ff]">Nothing you don&apos;t.</span></h2>
        <p className="font-jetbrains text-[15px] text-[#7ca8cc] leading-relaxed max-w-[520px]">Designed to keep you in flow from idea to code.</p>
        <div ref={featRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-15">
          {FEATURES.map((f) => (
            <div key={f.name} className="reveal-item feat-card bg-gradient-to-br from-[rgba(10,31,61,0.8)] to-[rgba(7,20,40,0.9)] border border-[rgba(0,180,255,0.1)] rounded-xl p-8 relative overflow-hidden hover:border-[rgba(0,180,255,0.35)] hover:-translate-y-1 transition-all duration-300" style={{ opacity: 0, transform: "translateY(28px)", transition: "opacity 0.55s ease, transform 0.55s ease" }}>
              <div className="w-12 h-12 rounded-[10px] bg-[rgba(0,180,255,0.1)] border border-[rgba(0,180,255,0.2)] flex items-center justify-center mb-5">{renderFeatureIcon(f.icon)}</div>
              <div className="text-[17px] font-bold mb-2.5 text-white">{f.name}</div>
              <div className="font-jetbrains text-[13px] text-[#7ca8cc] leading-relaxed">{f.desc}</div>
              <span className="font-jetbrains inline-block mt-4 text-[10px] tracking-[0.15em] text-[#00b4ff] uppercase border border-[rgba(0,180,255,0.25)] rounded-sm px-2 py-0.5">{f.tag}</span>
            </div>
          ))}
        </div>
      </section>

      {/* CODE DEMO */}
      <div id="demo" className="grid grid-cols-1 md:grid-cols-2 gap-15 items-center py-24 px-10 max-w-[1200px] mx-auto">
        <div>
          <div className="font-jetbrains text-[11px] tracking-[0.3em] text-[#00b4ff] uppercase mb-4 flex items-center gap-3"><span className="opacity-50">{"//"}</span> AI Inline Intelligence</div>
          <h2 className="text-[clamp(28px,3.5vw,44px)] font-extrabold leading-tight">Watch AI think<br/><span className="text-[#00b4ff]">alongside you</span></h2>
          <p className="font-jetbrains text-[13px] text-[#7ca8cc] leading-relaxed mt-4 max-w-[400px]">As you type, DevPilot analyzes intent, not just syntax. Suggestions appear at the right moment.</p>
          <div className="mt-8 flex flex-col gap-3">
            {["Multi-line completions","Bug detection while typing"].map((t)=>(
              <div key={t} className="font-jetbrains flex items-center gap-2.5 text-[13px] text-[#7ca8cc]"><span className="text-[#00b4ff]">✓</span> {t}</div>
            ))}
          </div>
        </div>
        <CodeSuggestDemo />
      </div>

      {/* WORKFLOW */}
      <div id="workflow" className="py-24 px-10 max-w-[1200px] mx-auto">
        <div className="text-center">
          <div className="font-jetbrains text-[11px] tracking-[0.3em] text-[#00b4ff] uppercase mb-4 flex items-center gap-3 justify-center"><span className="opacity-50">{"//"}</span> How It Works</div>
          <h2 className="text-[clamp(32px,4vw,52px)] font-extrabold leading-tight">From idea to <span className="text-[#00b4ff]">deployed</span></h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mt-15 relative">
          <div 
            className="absolute top-[36px] left-[12%] right-[12%] h-[1px] hidden lg:block"
            style={{
              backgroundImage: "linear-gradient(to right, transparent, #00CFFF, #3B82F6, #A855F7, #00CFFF, transparent)",
              backgroundSize: "200% 100%",
              animation: "landing-dividerShift 4s linear infinite",
              WebkitMaskImage: "linear-gradient(to right, transparent, white 10%, white 90%, transparent)",
              maskImage: "linear-gradient(to right, transparent, white 10%, white 90%, transparent)",
              filter: "drop-shadow(0 0 6px rgba(59, 130, 246, 0.5))",
            }}
          />
          {STEPS.map((s, i)=>(
            <div key={s.n} className="reveal-item step-card px-4 text-center" style={{ opacity: 0, transform: "translateY(28px)", transition: `opacity 0.55s ease ${i * 0.1}s, transform 0.55s ease ${i * 0.1}s` }}>
              <div 
                className="w-[72px] h-[72px] rounded-2xl mx-auto mb-6 relative z-10 flex items-center justify-center hover:scale-110 transition-all duration-300"
                style={{
                  backgroundColor: "#040d1a",
                  backgroundImage: "linear-gradient(135deg, rgba(0,207,255,0.15), rgba(168,85,247,0.15))",
                  border: "1px solid rgba(0,180,255,0.25)",
                  boxShadow: "0 0 20px rgba(0,180,255,0.1), inset 0 1px 0 rgba(255,255,255,0.05)",
                }}
              >
                <span 
                  className="font-montserrat text-[22px] font-black"
                  style={{
                    background: "linear-gradient(135deg, #00CFFF, #3B82F6, #A855F7)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >{s.n}</span>
              </div>
              <div className="text-[16px] font-bold mb-2 text-white">{s.t}</div>
              <div className="font-jetbrains text-[12px] text-[#7ca8cc] leading-relaxed">{s.d}</div>
            </div>
          ))}
        </div>
      </div>



      {/* CHAT DEMO */}
      <section id="chat-demo" className="py-24 px-10 max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-15 items-center">
          <div>
            <div className="font-jetbrains text-[11px] tracking-[0.3em] text-[#00b4ff] uppercase mb-4 flex items-center gap-3"><span className="opacity-50">{"//"}</span> AI Chat Assistant</div>
            <h2 className="text-[clamp(28px,3.5vw,44px)] font-extrabold leading-tight">Your smartest<br/><span className="text-[#a67bd4]">pair programmer</span></h2>
            <p className="font-jetbrains text-[13px] text-[#7ca8cc] leading-relaxed mt-4 max-w-[400px]">Ask DevPilot to build features, explain code, find bugs, write tests, or refactor entire files.</p>
            <div className="grid grid-cols-2 gap-3 mt-7">
              {[
                { name: "Generate functions", icon: "code" },
                { name: "Explain code", icon: "search" },
                { name: "Debug errors", icon: "bug" },
                { name: "Write tests", icon: "test" },
                { name: "Refactor", icon: "refactor" },
                { name: "Add docs", icon: "docs" }
              ].map((t)=>(
                <div key={t.name} className="font-jetbrains chat-pill bg-[rgba(0,0,0,0.25)] border border-[rgba(0,180,255,0.15)] rounded-md px-3.5 py-2 text-[12px] text-[#7ca8cc] hover:border-[rgba(0,180,255,0.4)] hover:text-[#e8f4ff] transition-colors flex items-center gap-2">
                  {renderPillIcon(t.icon)}
                  <span>{t.name}</span>
                </div>
              ))}
            </div>
          </div>
          <ChatDemo />
        </div>
      </section>

      {/* MARQUEE */}
      <div className="py-7 overflow-hidden border-y border-[rgba(0,180,255,0.07)] bg-[rgba(0,0,0,0.2)] flex items-center gap-6">
        <div className="font-jetbrains shrink-0 px-8 text-[10px] tracking-[0.25em] text-[#3a6080] whitespace-nowrap">RUNS ON</div>
        <div className="flex-1 overflow-hidden">
          <div className="flex gap-0 whitespace-nowrap animate-[landing-marqueeScroll_25s_linear_infinite]">
            {[...TECHS, ...TECHS, ...TECHS, ...TECHS, ...TECHS, ...TECHS, ...TECHS, ...TECHS].map((t, i) => (
              <span key={i} className="font-jetbrains inline-flex items-center text-[13px] font-medium text-[#7ca8cc] px-7 border-r border-[rgba(0,180,255,0.1)] hover:text-[#00b4ff] transition-colors">{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* PRICING */}
      <section id="pricing" className="py-24 px-10 max-w-[1200px] mx-auto">
        <div className="text-center mb-14">
          <div className="font-jetbrains text-[11px] tracking-[0.3em] text-[#00b4ff] uppercase mb-4 flex items-center gap-3 justify-center"><span className="opacity-50">{"//"}</span> Pricing</div>
          <h2 className="text-[clamp(32px,4vw,52px)] font-extrabold leading-tight">Start free.<br/><span className="text-[#00b4ff]">Scale infinitely.</span></h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-[900px] mx-auto justify-center items-stretch">
          {[
            { 
              tier: "Free Trial", 
              price: "₹0", 
              period: "/7 days", 
              desc: "Limited access for testing.", 
              features: [
                ["✓","1 Active Project"],
                ["✓","10k AI Tokens/day"],
                ["✓","Selected AI Models"]
              ], 
              btn: "Start Free Trial", 
              featured: false 
            },
            { 
              tier: "Pro", 
              price: "₹199", 
              period: "/mo", 
              desc: "For professional developers who move fast and ship often.", 
              features: [
                ["✓","Unlimited projects"],
                ["✓","Unlimited AI tokens"],
                ["✓","All AI models"],
                ["✓","Team Collaboration"]
              ], 
              btn: "Upgrade to Pro", 
              featured: true 
            },
          ].map((p)=>(
            <div 
              key={p.tier} 
              className={`reveal-item price-card rounded-2xl p-9 relative overflow-hidden transition-all duration-300 flex flex-col justify-between
                ${p.featured 
                  ? "landing-featured-card border border-[rgba(0,180,255,0.45)] bg-gradient-to-br from-[rgba(14,48,96,0.75)] to-[rgba(10,20,50,0.98)] shadow-[0_0_50px_rgba(0,180,255,0.15)] hover:shadow-[0_0_60px_rgba(0,180,255,0.3)] md:scale-[1.03] z-10 hover:-translate-y-2.5" 
                  : "border border-[rgba(0,180,255,0.1)] bg-gradient-to-br from-[rgba(10,31,61,0.7)] to-[rgba(7,20,40,0.9)] hover:-translate-y-1.5 hover:border-[rgba(0,180,255,0.3)]"
                }`} 
              style={{ opacity: 0, transform: "translateY(28px)", transition: "opacity 0.55s ease, transform 0.55s ease" }}
            >
              <div>
                {p.featured && <div className="font-jetbrains inline-block bg-[rgba(0,180,255,0.15)] border border-[rgba(0,180,255,0.3)] rounded-sm text-[10px] tracking-[0.15em] text-[#00b4ff] px-2.5 py-0.5 mb-4 uppercase">Most Popular</div>}
                <div className={`text-[13px] tracking-[0.2em] uppercase mb-3 ${p.featured ? "text-[#00b4ff]" : "text-[#7ca8cc]"}`}>{p.tier}</div>
                <div className="text-5xl font-extrabold text-white leading-none">{p.price}<span className="text-base font-normal text-[#7ca8cc]">{p.period}</span></div>
                <div className="font-jetbrains text-[13px] text-[#7ca8cc] leading-relaxed my-3.5">{p.desc}</div>
                <ul className="list-none flex flex-col gap-2.5 mb-8">
                  {p.features.map(([ck,txt], idx)=>(
                    <li key={idx} className="font-jetbrains text-[13px] text-[#e8f4ff] flex items-center gap-2.5">
                      <span className={`font-bold shrink-0 ${ck === "✓" ? "text-[#00b4ff]" : "text-[#3a6080]"}`}>{ck}</span>{txt}
                    </li>
                  ))}
                </ul>
              </div>
              <Link href="/dashboard" className={`font-oxanium block text-center py-3 px-6 rounded-lg text-[13px] font-bold tracking-[0.1em] uppercase no-underline cursor-none transition-all ${p.featured ? "bg-gradient-to-br from-[#1a5faa] to-[#00b4ff] text-white shadow-[0_0_24px_rgba(0,180,255,0.3)] hover:shadow-[0_0_40px_rgba(0,180,255,0.5)]" : "border border-[rgba(255,255,255,0.15)] text-[#e8f4ff] hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.3)]"}`}>{p.btn}</Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="text-center py-30 px-10 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[radial-gradient(ellipse,rgba(0,180,255,0.08)_0%,transparent_70%)] pointer-events-none"/>
        <div className="font-jetbrains text-[11px] tracking-[0.3em] text-[#00b4ff] uppercase mb-4 flex items-center gap-3 justify-center"><span className="opacity-50">{"//"}</span> Get Started Today</div>
        <h2 className="text-[clamp(36px,5vw,64px)] font-extrabold mb-5 leading-tight">Start <span className="bg-gradient-to-r from-[#00b4ff] to-[#a67bd4] bg-clip-text text-transparent">Building</span></h2>
        <p className="font-jetbrains text-[15px] text-[#7ca8cc] mb-10">No downloads. No setup. Open DevPilot and start building in under 1 minute.</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/dashboard" className="font-oxanium relative overflow-hidden bg-gradient-to-br from-[#1a5faa] to-[#00b4ff] text-white px-10 py-4 rounded-md text-[15px] font-bold tracking-[0.1em] uppercase no-underline shadow-[0_0_30px_rgba(0,180,255,0.3)] hover:shadow-[0_0_50px_rgba(0,180,255,0.5)] hover:-translate-y-0.5 transition-all cursor-none">Launch DevPilot</Link>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="font-jetbrains border-t border-[rgba(255,255,255,0.05)] px-10 py-10 flex items-center justify-between flex-wrap max-w-[1200px] mx-auto text-[12px] text-[#3a6080]">
        <div className="flex items-center gap-2.5">
          <Image src="/icon-bg-removed.png" alt="DevPilot" width={24} height={24} className="w-6 h-6 object-contain" />
          DevPilot © 2026 — AI Powered IDE
        </div>
        <div>
          Built by{" "}
          <a 
            href="https://www.linkedin.com/in/princethakarar/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-[#3a6080] no-underline hover:text-[#00b4ff] transition-colors font-semibold cursor-none"
          >
            Prince Thakarar
          </a>
        </div>
      </footer>
    </>
  );
}

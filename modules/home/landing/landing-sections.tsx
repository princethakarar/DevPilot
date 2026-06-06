"use client";
import Link from "next/link";
import Image from "next/image";
import ChatDemo from "./chat-demo";
import { useEffect, useRef } from "react";

const FEATURES = [
  { icon: "⚡", name: "AI Inline Suggestions", desc: "Context-aware completions that understand your entire codebase — not just the current line.", tag: "Real-time" },
  { icon: "🤖", name: "AI Chat Assistant", desc: "Ask anything. Refactor, debug, explain, or generate entire modules through natural conversation.", tag: "GPT-4 · Claude" },
  { icon: "🔗", name: "GitHub Repo Open", desc: "Paste any GitHub URL and your full project loads instantly — branches, history, CI status all visible.", tag: "One Click" },
  { icon: "🚀", name: "Instant Project Setup", desc: "Zero config. Any stack. Containers spin up in seconds, pre-configured with the right tools.", tag: "Zero Config" },
  { icon: "🌐", name: "Live App Preview", desc: "See your changes render in real time. Embedded browser with hot-reload directly inside the IDE.", tag: "Hot Reload" },
  { icon: "📡", name: "Portable & Cloud-Native", desc: "Your entire dev environment lives in the cloud. Access it from any device, anywhere.", tag: "Any Device" },
];
const STEPS = [
  { n: "01", t: "Open Repo", d: "Paste any GitHub URL. DevPilot clones and configures your environment instantly." },
  { n: "02", t: "AI Analyses", d: "The AI reads your entire codebase, understands architecture, and activates suggestions." },
  { n: "03", t: "Code & Chat", d: "Write with inline AI completions. Ask the assistant to build, explain, or refactor." },
  { n: "04", t: "Live Preview", d: "See your app running in real time. Test, iterate, and share preview links." },
  { n: "05", t: "Ship It", d: "Push to GitHub, deploy to any cloud, or invite your team to collaborate." },
];
const TECHS = ["React","Next.js","Vue","Svelte","Node.js","Python","Rust","Go","TypeScript","Docker","Postgres","Redis","FastAPI","GraphQL","Tailwind","Three.js"];

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
        <p className="font-jetbrains text-[15px] text-[#7ca8cc] leading-relaxed max-w-[520px]">Every feature engineered to remove friction and let intelligence flow.</p>
        <div ref={featRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-15">
          {FEATURES.map((f) => (
            <div key={f.name} className="reveal-item feat-card bg-gradient-to-br from-[rgba(10,31,61,0.8)] to-[rgba(7,20,40,0.9)] border border-[rgba(0,180,255,0.1)] rounded-xl p-8 relative overflow-hidden hover:border-[rgba(0,180,255,0.35)] hover:-translate-y-1 transition-all duration-300" style={{ opacity: 0, transform: "translateY(28px)", transition: "opacity 0.55s ease, transform 0.55s ease" }}>
              <div className="w-12 h-12 rounded-[10px] bg-[rgba(0,180,255,0.1)] border border-[rgba(0,180,255,0.2)] flex items-center justify-center mb-5 text-[22px]">{f.icon}</div>
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
            {["Multi-line completions","Bug detection while typing","Docstring & test generation","Context from entire repo"].map((t)=>(
              <div key={t} className="font-jetbrains flex items-center gap-2.5 text-[13px] text-[#7ca8cc]"><span className="text-[#00b4ff]">✓</span> {t}</div>
            ))}
          </div>
        </div>
        <div className="bg-[#07111f] border border-[rgba(0,180,255,0.15)] rounded-xl overflow-hidden shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 px-4 py-3 bg-[rgba(0,0,0,0.3)] border-b border-[rgba(255,255,255,0.05)]">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]"/><div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"/><div className="w-2.5 h-2.5 rounded-full bg-[#28c840]"/>
            <span className="font-jetbrains text-[11px] text-[#7ca8cc] ml-2">api_handler.py</span>
          </div>
          <div className="font-jetbrains p-6 text-[12.5px] leading-[1.8]">
            <div><span className="text-[#3a6080] mr-5 select-none text-[11px]">1</span><span className="text-[#546e7a] italic"># DevPilot AI — auto-analyzing context...</span></div>
            <div><span className="text-[#3a6080] mr-5 select-none text-[11px]">2</span></div>
            <div><span className="text-[#3a6080] mr-5 select-none text-[11px]">3</span><span className="text-[#c792ea]">import</span> <span className="text-[#82aaff]">asyncio</span></div>
            <div><span className="text-[#3a6080] mr-5 select-none text-[11px]">4</span><span className="text-[#c792ea]">from</span> <span className="text-[#82aaff]">devpilot</span> <span className="text-[#c792ea]">import</span> AI, Context</div>
            <div><span className="text-[#3a6080] mr-5 select-none text-[11px]">5</span></div>
            <div><span className="text-[#3a6080] mr-5 select-none text-[11px]">6</span><span className="text-[#c792ea]">async def</span> <span className="text-[#82aaff]">handle_request</span>(req):</div>
            <div className="landing-ai-line"><span className="text-[#3a6080] mr-5 select-none text-[11px]">7</span><span className="text-[#c792ea]">&nbsp;&nbsp;&nbsp;&nbsp;ctx</span> = <span className="text-[#82aaff]">Context</span>.from_req(req)<span className="absolute right-3 top-1/2 -translate-y-1/2 bg-[rgba(0,180,255,0.15)] border border-[rgba(0,180,255,0.3)] rounded-sm text-[9px] px-1.5 text-[#00b4ff] tracking-wider">AI ✦</span></div>
            <div className="landing-ai-line"><span className="text-[#3a6080] mr-5 select-none text-[11px]">8</span><span className="text-[#c792ea]">&nbsp;&nbsp;&nbsp;&nbsp;result</span> = <span className="text-[#c792ea]">await</span> <span className="text-[#82aaff]">AI</span>.suggest(ctx)<span className="absolute right-3 top-1/2 -translate-y-1/2 bg-[rgba(0,180,255,0.15)] border border-[rgba(0,180,255,0.3)] rounded-sm text-[9px] px-1.5 text-[#00b4ff] tracking-wider">AI ✦</span></div>
            <div className="landing-ai-line"><span className="text-[#3a6080] mr-5 select-none text-[11px]">9</span>&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-[#c792ea]">return</span> {"{"}<span className="text-[#c3e88d]">&quot;data&quot;</span>: result, <span className="text-[#c3e88d]">&quot;ok&quot;</span>: <span className="text-[#c792ea]">True</span>{"}"}<span className="absolute right-3 top-1/2 -translate-y-1/2 bg-[rgba(0,180,255,0.15)] border border-[rgba(0,180,255,0.3)] rounded-sm text-[9px] px-1.5 text-[#00b4ff] tracking-wider">AI ✦</span></div>
            <div><span className="text-[#3a6080] mr-5 select-none text-[11px]">10</span></div>
            <div><span className="text-[#3a6080] mr-5 select-none text-[11px]">11</span>&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-[#546e7a] italic"># refining response...</span></div>
            <div><span className="text-[#3a6080] mr-5 select-none text-[11px]">12</span>&nbsp;&nbsp;&nbsp;&nbsp;<span className="inline-block w-0.5 h-3.5 bg-[#00b4ff] align-middle animate-[landing-blink_1s_infinite]"/></div>
          </div>
        </div>
      </div>

      {/* WORKFLOW */}
      <div id="workflow" className="py-24 px-10 max-w-[1200px] mx-auto">
        <div className="text-center">
          <div className="font-jetbrains text-[11px] tracking-[0.3em] text-[#00b4ff] uppercase mb-4 flex items-center gap-3 justify-center"><span className="opacity-50">{"//"}</span> How It Works</div>
          <h2 className="text-[clamp(32px,4vw,52px)] font-extrabold leading-tight">From idea to <span className="text-[#00b4ff]">deployed</span></h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-0 mt-15 relative">
          <div className="absolute top-8 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[rgba(0,180,255,0.25)] to-transparent"/>
          {STEPS.map((s)=>(
            <div key={s.n} className="reveal-item step-card px-5 text-center" style={{ opacity: 0, transform: "translateY(28px)", transition: "opacity 0.55s ease, transform 0.55s ease" }}>
              <div className="w-16 h-16 rounded-full bg-[#0a1f3d] border border-[rgba(0,180,255,0.3)] flex items-center justify-center text-xl font-extrabold text-[#00b4ff] mx-auto mb-6 relative z-[1] hover:bg-[rgba(0,180,255,0.1)] hover:shadow-[0_0_24px_rgba(0,180,255,0.3)] transition-all">{s.n}</div>
              <div className="text-[15px] font-bold mb-2">{s.t}</div>
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
              {["⚡ Generate functions","🔍 Explain code","🐛 Debug errors","🧪 Write tests","♻️ Refactor","📝 Add docs"].map((t)=>(
                <div key={t} className="font-jetbrains chat-pill bg-[rgba(0,0,0,0.25)] border border-[rgba(0,180,255,0.15)] rounded-md px-3.5 py-2 text-[12px] text-[#7ca8cc] hover:border-[rgba(0,180,255,0.4)] hover:text-[#e8f4ff] transition-colors">{t}</div>
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
          <div className="flex gap-0 whitespace-nowrap animate-[landing-marqueeScroll_28s_linear_infinite]">
            {[...TECHS,...TECHS].map((t,i)=>(
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { tier: "Free", price: "₹0", desc: "Perfect for solo projects and open source hacking.", features: [["✓","3 active projects"],["✓","AI suggestions (50k tokens/day)"],["✓","GitHub integration"],["✓","Live preview"],["—","Team collaboration"],["—","Custom AI models"]], btn: "Get Started Free", featured: false },
            { tier: "Pro", price: "₹199", desc: "For professional developers who move fast and ship often.", features: [["✓","Unlimited projects"],["✓","Unlimited AI tokens"],["✓","All AI models (GPT-4o, Claude)"],["✓","Priority live preview"],["✓","3 team seats"],["✓","Custom environment"]], btn: "Start Pro Trial", featured: true },
            { tier: "Team", price: "₹499", desc: "Built for engineering teams that build together.", features: [["✓","Everything in Pro"],["✓","Unlimited seats"],["✓","Shared AI context"],["✓","Admin controls"],["✓","SSO / SAML"],["✓","SLA & dedicated support"]], btn: "Contact Sales", featured: false },
          ].map((p)=>(
            <div key={p.tier} className={`reveal-item price-card rounded-2xl p-9 relative overflow-hidden hover:-translate-y-1.5 transition-all duration-300 ${p.featured ? "landing-featured-card border border-[rgba(0,180,255,0.35)] bg-gradient-to-br from-[rgba(14,48,96,0.7)] to-[rgba(10,20,50,0.95)]" : "border border-[rgba(0,180,255,0.1)] bg-gradient-to-br from-[rgba(10,31,61,0.7)] to-[rgba(7,20,40,0.9)]"} hover:border-[rgba(0,180,255,0.3)]`} style={{ opacity: 0, transform: "translateY(28px)", transition: "opacity 0.55s ease, transform 0.55s ease" }}>
              {p.featured && <div className="font-jetbrains inline-block bg-[rgba(0,180,255,0.15)] border border-[rgba(0,180,255,0.3)] rounded-sm text-[10px] tracking-[0.15em] text-[#00b4ff] px-2.5 py-0.5 mb-4 uppercase">Most Popular</div>}
              <div className={`text-[13px] tracking-[0.2em] uppercase mb-3 ${p.featured ? "text-[#00b4ff]" : p.tier === "Team" ? "text-[#a67bd4]" : "text-[#7ca8cc]"}`}>{p.tier}</div>
              <div className="text-5xl font-extrabold text-white leading-none">{p.price}<span className="text-base font-normal text-[#7ca8cc]">/mo</span></div>
              <div className="font-jetbrains text-[13px] text-[#7ca8cc] leading-relaxed my-3.5">{p.desc}</div>
              <ul className="list-none flex flex-col gap-2.5 mb-8">
                {p.features.map(([ck,txt])=>(
                  <li key={txt} className="font-jetbrains text-[13px] text-[#e8f4ff] flex items-center gap-2.5">
                    <span className={`font-bold shrink-0 ${ck === "✓" ? "text-[#00b4ff]" : "text-[#3a6080]"}`}>{ck}</span>{txt}
                  </li>
                ))}
              </ul>
              <Link href="/dashboard" className={`font-oxanium block text-center py-3 px-6 rounded-lg text-[13px] font-bold tracking-[0.1em] uppercase no-underline cursor-none transition-all ${p.featured ? "bg-gradient-to-br from-[#1a5faa] to-[#00b4ff] text-white shadow-[0_0_24px_rgba(0,180,255,0.3)] hover:shadow-[0_0_40px_rgba(0,180,255,0.5)]" : "border border-[rgba(255,255,255,0.15)] text-[#e8f4ff] hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.3)]"}`}>{p.btn}</Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="text-center py-30 px-10 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[radial-gradient(ellipse,rgba(0,180,255,0.08)_0%,transparent_70%)] pointer-events-none"/>
        <div className="font-jetbrains text-[11px] tracking-[0.3em] text-[#00b4ff] uppercase mb-4 flex items-center gap-3 justify-center"><span className="opacity-50">{"//"}</span> Get Started Today</div>
        <h2 className="text-[clamp(36px,5vw,64px)] font-extrabold mb-5 leading-tight">Your next project<br/>starts <span className="bg-gradient-to-r from-[#00b4ff] to-[#a67bd4] bg-clip-text text-transparent">right now</span></h2>
        <p className="font-jetbrains text-[15px] text-[#7ca8cc] mb-10">No downloads. No setup. Open DevPilot and start building in under 30 seconds.</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/dashboard" className="font-oxanium relative overflow-hidden bg-gradient-to-br from-[#1a5faa] to-[#00b4ff] text-white px-10 py-4 rounded-md text-[15px] font-bold tracking-[0.1em] uppercase no-underline shadow-[0_0_30px_rgba(0,180,255,0.3)] hover:shadow-[0_0_50px_rgba(0,180,255,0.5)] hover:-translate-y-0.5 transition-all cursor-none">Launch DevPilot — Free ↗</Link>
          <a href="#" className="font-oxanium bg-transparent text-[#e8f4ff] px-10 py-4 rounded-md text-[15px] font-semibold tracking-[0.1em] uppercase no-underline border border-[rgba(255,255,255,0.15)] hover:border-[rgba(255,255,255,0.4)] hover:bg-[rgba(255,255,255,0.04)] transition-all cursor-none">View on GitHub</a>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="font-jetbrains border-t border-[rgba(255,255,255,0.05)] px-10 py-10 flex items-center justify-between flex-wrap max-w-[1200px] mx-auto text-[12px] text-[#3a6080]">
        <div className="flex items-center gap-2.5">
          <Image src="/icon-bg-removed.png" alt="DevPilot" width={24} height={24} className="w-6 h-6 object-contain" />
          DevPilot © 2026 — AI Powered IDE
        </div>
        <div className="flex gap-6">
          {["Privacy","Terms","Docs","GitHub"].map((t)=>(
            <a key={t} href="#" className="text-[#3a6080] no-underline hover:text-[#00b4ff] transition-colors">{t}</a>
          ))}
        </div>
      </footer>
    </>
  );
}

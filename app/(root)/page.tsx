"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import IntroAnimation from "@/modules/home/landing/intro-animation";
import CustomCursor from "@/modules/home/landing/custom-cursor";
import HeroCanvas from "@/modules/home/landing/hero-canvas";
import ChatDemo from "@/modules/home/landing/chat-demo";
import LandingSections from "@/modules/home/landing/landing-sections";

export default function Home() {
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    document.body.classList.add("landing-active");
    return () => { document.body.classList.remove("landing-active"); };
  }, []);

  return (
    <div>
      <CustomCursor />
      {!introDone && <IntroAnimation onComplete={() => setIntroDone(true)} />}

      <div className={`transition-opacity duration-800 ${introDone ? "opacity-100" : "opacity-0"}`}>
        {/* NAV */}
        <nav className="fixed top-0 left-0 right-0 z-[500] flex items-center justify-between px-10 h-16 bg-[rgba(5,13,26,0.7)] backdrop-blur-[20px] border-b border-[rgba(0,180,255,0.08)]">
          <Link href="/" className="flex items-center gap-2.5 no-underline font-montserrat">
            <Image src="/icon-bg-removed.png" alt="DevPilot" width={40} height={40}  className="object-contain drop-shadow-[0_0_8px_rgba(0,207,255,0.3)]" />
            <div className="flex flex-col leading-none">
              <div className="flex items-baseline">
                <span className="text-[25px] text-white tracking-tight" style={{ fontWeight: 600 }}>Dev</span>
                <span className="text-[25px] tracking-tight" style={{ fontWeight: 700, background: "linear-gradient(to right, #00CFFF, #3B82F6, #A855F7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Pilot</span>
              </div>
              <span className="text-[10px] tracking-[0.25em] uppercase mt-0.5" style={{ color: "#94A3B8", fontWeight: 400 }}>AI POWERED IDE</span>
            </div>
          </Link>
          <ul className="hidden md:flex gap-8 list-none">
            {[["#features", "Features"], ["#demo", "Editor"], ["#workflow", "Workflow"], ["#chat-demo", "AI Chat"], ["#pricing", "Pricing"]].map(([href, label], i) => (
              <li key={i}><a href={href} className="text-[13px] tracking-[0.08em] text-[#7ca8cc] no-underline uppercase hover:text-[#00b4ff] transition-colors">{label}</a></li>
            ))}
          </ul>
        </nav>

        {/* HERO */}
        <section id="hero" className="min-h-screen flex flex-col items-center justify-center text-center px-10 pt-20 pb-15 relative overflow-hidden">
          <HeroCanvas />
          <div className="font-jetbrains absolute top-[18%] left-[6%] text-[11px] text-[rgba(0,180,255,0.35)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_8s_ease-in-out_infinite] z-0">const ai = new DevPilot();</div>
          <div className="font-jetbrains absolute top-[30%] right-[5%] text-[11px] text-[rgba(0,180,255,0.35)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_10s_2s_ease-in-out_infinite] z-0">0101 1100 0011</div>
          <div className="font-jetbrains absolute top-[65%] left-[4%] text-[11px] text-[rgba(0,180,255,0.35)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_9s_1s_ease-in-out_infinite] z-0">&lt;/&gt; &lt;&gt; {"{}"}</div>
          <div className="font-jetbrains absolute top-[72%] right-[6%] text-[11px] text-[rgba(0,180,255,0.35)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_11s_3s_ease-in-out_infinite] z-0">await suggest(context)</div>

          <div className="max-w-[1100px] mx-auto flex flex-col items-center justify-center relative z-[1]">
            <h1 className="font-montserrat text-[clamp(40px,7.5vw,92px)] leading-[1.05] tracking-tight animate-[landing-fadeUp_0.7s_0.4s_both]">
              <span className="text-white block" style={{ fontWeight: 600 }}>Code at</span>
              <span 
                className="block"
                style={{ 
                  fontWeight: 700, 
                  background: "linear-gradient(to right, #00CFFF, #3B82F6, #A855F7)", 
                  WebkitBackgroundClip: "text", 
                  WebkitTextFillColor: "transparent", 
                  backgroundClip: "text" 
                }}
              >
                Thought Speed
              </span>
            </h1>

            {/* Glowing Divider */}
            <div className="w-full max-w-[400px] mt-10 mb-8 animate-[landing-fadeUp_0.7s_0.5s_both]">
              <div 
                className="w-full h-[2px]"
                style={{ 
                  backgroundImage: "linear-gradient(to right, #00CFFF, #3B82F6, #A855F7, #00CFFF)",
                  backgroundSize: "200% 100%",
                  animation: "landing-dividerShift 4s linear infinite",
                  WebkitMaskImage: "linear-gradient(to right, transparent, white 20%, white 80%, transparent)",
                  maskImage: "linear-gradient(to right, transparent, white 20%, white 80%, transparent)",
                  filter: "drop-shadow(0 0 8px rgba(59, 130, 246, 0.65))"
                }}
              />
            </div>

            {/* Supporting Text */}
            <div className="font-montserrat text-[clamp(16px,1.5vw,20px)] tracking-[0.25em] text-[#94A3B8] uppercase font-medium mb-14 animate-[landing-fadeUp_0.7s_0.6s_both]">
              AI-Powered IDE
            </div>

            {/* CTA Button */}
            <div className="animate-[landing-fadeUp_0.7s_0.8s_both]">
              <Link href="/dashboard" className="no-underline cursor-none">
                <button 
                  suppressHydrationWarning
                  className="font-oxanium bg-gradient-to-r from-[#2563EB] to-[#8B5CF6] text-white px-10 py-4 text-sm font-bold tracking-[0.1em] uppercase cursor-none transition-all duration-300 hover:scale-[1.03] rounded-[16px] outline-none"
                  style={{
                    boxShadow: '0 0 40px rgba(99,102,241,0.35)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 50px rgba(99,102,241,0.6)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 40px rgba(99,102,241,0.35)';
                  }}
                >
                  Launch DevPilot
                </button>
              </Link>
            </div>
          </div>
        </section>

        <LandingSections />
      </div>
    </div>
  );
}

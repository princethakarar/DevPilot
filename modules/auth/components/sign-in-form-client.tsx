"use client";

import React from "react";
import Image from "next/image";
import { signIn } from "next-auth/react";

function handleGoogleSignIn(e: React.MouseEvent) {
  e.preventDefault();
  signIn("google", { callbackUrl: "/" });
}

function handleGithubSignIn(e: React.MouseEvent) {
  e.preventDefault();
  signIn("github", { callbackUrl: "/" });
}

const SignInFormClient = () => {
  return (
    <div className="w-full max-w-md p-[1.5px] rounded-3xl relative overflow-hidden group shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      {/* Running thin border of our theme gradient */}
      <div 
        className="absolute -inset-[200%] bg-[conic-gradient(from_0deg,#00CFFF,#3B82F6,#A855F7,#00CFFF)] animate-[spin_8s_linear_infinite] group-hover:[animation-play-state:paused] pointer-events-none" 
        style={{ transformOrigin: "center center" }}
      />

      {/* Inner card content wrapper */}
      <div className="relative z-10 w-full p-8 rounded-[22.5px] bg-gradient-to-br from-[#060e1a] to-[#040912] flex flex-col">
        {/* Futuristic decorative background design elements */}
        <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full bg-[#3B82F6] opacity-5 blur-[50px] pointer-events-none" />
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-[#A855F7] opacity-5 blur-[50px] pointer-events-none" />

        {/* Header section with brand logo */}
        <div className="flex flex-col items-center mb-8 text-center space-y-4 relative z-20">
          <div className="relative group/logo">
            {/* Gradient behind logo: only appears on hover of container or logo */}
            <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-[#00CFFF] to-[#A855F7] opacity-0 group-hover:opacity-40 group-hover/logo:opacity-85 blur-[8px] transition-opacity duration-500 pointer-events-none" />
            <Image
              src="/icon-bg-removed.png"
              alt="DevPilot Logo"
              width={70}
              height={70}
              className="relative object-contain drop-shadow-[0_0_15px_rgba(0,207,255,0.4)] transition-transform duration-500 group-hover/logo:scale-110"
            />
          </div>

          <div className="flex flex-col leading-none mt-2">
            <div className="flex items-baseline justify-center">
              <span className="text-[32px] font-bold text-white tracking-tight font-montserrat">Dev</span>
              <span className="text-[32px] font-extrabold tracking-tight font-montserrat" style={{ background: "linear-gradient(to right, #00CFFF, #3B82F6, #A855F7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Pilot</span>
            </div>
            <span className="text-[10px] tracking-[0.25em] uppercase mt-2 font-jetbrains text-[#7ca8cc] font-semibold">AI-POWERED IDE</span>
          </div>
        </div>

        {/* Provider sign-in buttons */}
        <div className="flex flex-col gap-4 relative z-20">
          {/* Google */}
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl border border-[rgba(0,180,255,0.15)] bg-[rgba(5,13,26,0.4)] text-white font-medium hover:bg-[rgba(0,180,255,0.08)] hover:border-[#00CFFF] hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(0,207,255,0.25)] transition-all duration-300 cursor-pointer outline-none group/btn"
          >
            <svg className="w-5 h-5 transition-transform duration-300 group-hover/btn:scale-110" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            <span className="font-oxanium text-sm tracking-[0.05em]">CONNECT GOOGLE ID</span>
          </button>

          {/* GitHub */}
          <button
            onClick={handleGithubSignIn}
            className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl border border-[rgba(0,180,255,0.15)] bg-[rgba(5,13,26,0.4)] text-white font-medium hover:bg-[rgba(168,85,247,0.08)] hover:border-[#a67bd4] hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(166,123,212,0.25)] transition-all duration-300 cursor-pointer outline-none group/btn2"
          >
            <svg className="w-5 h-5 text-white transition-transform duration-300 group-hover/btn2:scale-110" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <span className="font-oxanium text-sm tracking-[0.05em]">CONNECT GITHUB PROFILE</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignInFormClient;

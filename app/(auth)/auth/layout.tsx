import React from "react";
import HeroCanvas from "@/modules/home/landing/hero-canvas";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="dark bg-[#050d1a] text-[#e8f4ff] min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated particle canvas background */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-50">
        <HeroCanvas />
      </div>

      {/* Floating cyber-tech decorations */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden select-none">
        <div className="font-jetbrains absolute top-[15%] left-[8%] text-[11px] text-[rgba(0,180,255,0.18)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_8s_ease-in-out_infinite]">
          const ai = new DevPilot();
        </div>
        <div className="font-jetbrains absolute top-[25%] right-[10%] text-[11px] text-[rgba(0,180,255,0.18)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_10s_2s_ease-in-out_infinite]">
          0101 1100 0011
        </div>
        <div className="font-jetbrains absolute top-[60%] left-[6%] text-[11px] text-[rgba(0,180,255,0.18)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_9s_1s_ease-in-out_infinite]">
          &lt;/&gt; &lt;&gt; {"{}"}
        </div>
        <div className="font-jetbrains absolute top-[75%] right-[8%] text-[11px] text-[rgba(0,180,255,0.18)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_11s_3s_ease-in-out_infinite]">
          await suggest(context)
        </div>
        <div className="font-jetbrains absolute top-[85%] left-[10%] text-[11px] text-[rgba(166,123,212,0.18)] pointer-events-none whitespace-nowrap animate-[landing-orbitFloat_12s_ease-in-out_infinite]">
          import {"{ IDE }"} from "devpilot"
        </div>
      </div>

      <div className="relative z-10 w-full flex flex-col items-center justify-center">
        {children}
      </div>
    </main>
  );
}


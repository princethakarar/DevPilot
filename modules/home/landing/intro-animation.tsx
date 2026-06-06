"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export default function IntroAnimation({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rocketRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const W = canvas.width, H = canvas.height;

    // Rocket size — ~11% of screen height
    const rocketSize = Math.round(H * 0.13);
    const halfRocket = rocketSize / 2;

    // Starfield
    const stars = Array.from({ length: 200 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.5,
      alpha: 0.2 + Math.random() * 0.7,
      twinkle: Math.random() * Math.PI * 2,
    }));

    // Trail particles
    const trail: { x: number; y: number; vx: number; vy: number; r: number; alpha: number; decay: number; color: string }[] = [];
    const trailColors = ["#00d4ff", "#00b4ff", "#a67bd4", "#5b7ff5", "#00ffcc", "#ffffff"];

    function spawnTrail(x: number, y: number) {
      for (let i = 0; i < 4; i++) {
        trail.push({
          x, y,
          vx: (Math.random() - 0.5) * 2.5,
          vy: (Math.random() - 0.5) * 2.5 + 1.5,
          r: 1.5 + Math.random() * 3,
          alpha: 0.9,
          decay: 0.025 + Math.random() * 0.03,
          color: trailColors[Math.floor(Math.random() * trailColors.length)],
        });
      }
    }

    // Bezier path — bottom-left to upper-right
    const startX = -rocketSize, startY = H + rocketSize;
    const endX = W + rocketSize, endY = -rocketSize;
    const cp1x = W * 0.25, cp1y = H * 0.6;
    const cp2x = W * 0.7, cp2y = H * 0.1;

    function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number) {
      const u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    }
    function easeInOutCubic(t: number) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    let frame = 0;
    const TOTAL = 110;
    let rocketPassed = false, logoShown = false;
    let animId: number;

    // Update rocket element size
    if (rocketRef.current) {
      rocketRef.current.style.width = `${rocketSize}px`;
      rocketRef.current.style.height = `${rocketSize}px`;
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);
      ctx!.fillStyle = "#000814";
      ctx!.fillRect(0, 0, W, H);

      // Stars
      stars.forEach((s) => {
        const a = s.alpha * (0.6 + 0.4 * Math.sin(s.twinkle + frame * 0.02));
        ctx!.save();
        ctx!.globalAlpha = a;
        ctx!.fillStyle = "#ffffff";
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      });

      // Trail particles
      for (let i = trail.length - 1; i >= 0; i--) {
        const p = trail[i];
        p.x += p.vx; p.y += p.vy; p.alpha -= p.decay;
        if (p.alpha <= 0) { trail.splice(i, 1); continue; }
        ctx!.save();
        ctx!.globalAlpha = p.alpha;
        ctx!.fillStyle = p.color;
        ctx!.shadowColor = p.color;
        ctx!.shadowBlur = 6;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }

      // Rocket position along bezier
      const rawT = frame / TOTAL;
      const t = Math.min(rawT, 1);
      const easedT = easeInOutCubic(t);
      const rx = cubicBezier(easedT, startX, cp1x, cp2x, endX);
      const ry = cubicBezier(easedT, startY, cp1y, cp2y, endY);

      // Compute angle of travel (tangent to the curve)
      const dt = 0.01;
      const tt = Math.min(t + dt, 1);
      const et2 = easeInOutCubic(tt);
      const dx = cubicBezier(et2, startX, cp1x, cp2x, endX) - rx;
      const dy = cubicBezier(et2, startY, cp1y, cp2y, endY) - ry;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const rocketHeadingOffset = 40;                               // angle of rocket

      // Subtle scale pulse at midpoint
      const midDist = Math.abs(t - 0.5);
      const scl = 1 + (1 - midDist * 2) * 0.4;

      // Position the rocket div: translate places center of rocket at (rx, ry)
      // The div is anchored at top:0, left:0, so translate(rx - half, ry - half)
      // centers the rocket icon at the bezier point
      if (rocketRef.current) {
        rocketRef.current.style.transform =
          `translate(${rx - halfRocket}px, ${ry - halfRocket}px) rotate(${angle + rocketHeadingOffset}deg) scale(${scl})`;
        // Show rocket only while the beam is active, hide after it exits
        rocketRef.current.style.opacity = (t > 0 && t < 1) ? "1" : "0";
      }

      // Spawn trail particles behind the rocket (at the rocket center)
      if (t > 0.02 && t < 0.98) spawnTrail(rx, ry);

      // Glow around rocket
      if (t > 0.05 && t < 0.95) {
        const grad = ctx!.createRadialGradient(rx, ry, 0, rx, ry, 60);
        grad.addColorStop(0, "rgba(0,212,255,0.15)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(rx, ry, 60, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Burst at center
      if (t >= 0.48 && !rocketPassed) {
        rocketPassed = true;
        const burstColors = ["#00d4ff", "#a67bd4", "#ffffff", "#5b7ff5", "#00ffcc"];
        for (let i = 0; i < 80; i++) {
          const ba = Math.random() * Math.PI * 2;
          const bs = 2 + Math.random() * 7;
          trail.push({
            x: rx, y: ry,
            vx: Math.cos(ba) * bs, vy: Math.sin(ba) * bs,
            r: 1 + Math.random() * 3, alpha: 1,
            decay: 0.012 + Math.random() * 0.018,
            color: burstColors[Math.floor(Math.random() * burstColors.length)],
          });
        }
      }

      // Show logo end card
      if (frame === 82 && !logoShown) {
        logoShown = true;
        logoRef.current?.classList.add("opacity-100", "scale-100", "translate-y-0");
        logoRef.current?.classList.remove("opacity-0", "scale-75", "translate-y-5");
        setTimeout(() => {
          subRef.current?.classList.add("opacity-100", "translate-y-0");
          subRef.current?.classList.remove("opacity-0", "translate-y-2.5");
        }, 350);
      }

      frame++;

      if (frame <= TOTAL + 40) {
        animId = requestAnimationFrame(draw);
      } else {
        setFadeOut(true);
        setTimeout(() => onComplete(), 700);
      }
    }

    const timer = setTimeout(() => { animId = requestAnimationFrame(draw); }, 300);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animId);
    };
  }, [onComplete]);

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[8000] flex items-center justify-center flex-col overflow-hidden bg-[#000814] transition-opacity duration-700 ${fadeOut ? "opacity-0 pointer-events-none" : ""}`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Subtle top-right glow effect for cohesion */}
      <div
        className="absolute top-0 right-0 w-[500px] h-[500px] pointer-events-none z-[1]"
        style={{
          background: "radial-gradient(ellipse at 100% 0%, rgba(0,207,255,0.06) 0%, rgba(59,130,246,0.03) 40%, transparent 70%)",
        }}
      />

      {/* Flying rocket — anchored at top:0 left:0, positioned entirely via transform translate */}
      <div
        ref={rocketRef}
        className="absolute z-[2] pointer-events-none drop-shadow-[0_0_24px_rgba(0,212,255,0.9)]"
        style={{ top: 0, left: 0, opacity: 0, transformOrigin: "center center" }}
      >
        <Image
          src="/icon-bg-removed.png"
          alt="Rocket"
          width={120}
          height={120}
          className="w-full h-full object-contain"
          style={{ background: "none" }}
          priority
        />
      </div>

      {/* Center logo reveal — End Card */}
      <div
        ref={logoRef}
        className="relative z-[3] flex flex-row items-center gap-6 opacity-0 scale-75 translate-y-5 transition-all duration-700 ease-out"
      >
        {/* Icon to the left */}
        <Image
          src="/icon-bg-removed.png"
          alt="DevPilot"
          width={90}
          height={90}
          className="w-[120px] h-[120px] object-contain shrink-0 drop-shadow-[0_0_16px_rgba(0,207,255,0.4)]"
          priority
        />

        {/* Text block to the right */}
        <div className="flex flex-col items-start">
          {/* DevPilot heading */}
          <div className="flex items-baseline leading-none font-montserrat">
            <span
              className="text-[56px] text-white tracking-tight"
              style={{ fontWeight: 600 }}
            >
              Dev
            </span>
            <span
              className="text-[56px] tracking-tight"
              style={{
                fontWeight: 700,
                background: "linear-gradient(to right, #00CFFF, #3B82F6, #A855F7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Pilot
            </span>
          </div>

          {/* Subtitle */}
          <div
            ref={subRef}
            className="mt-2 text-[13px] tracking-[0.3em] uppercase opacity-0 translate-y-2.5 transition-all duration-600 delay-300 font-montserrat"
            style={{ color: "#94A3B8", fontWeight: 400 }}
          >
            AI POWERED IDE
          </div>
        </div>
      </div>
    </div>
  );
}

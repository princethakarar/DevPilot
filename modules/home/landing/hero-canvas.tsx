"use client";

import { useEffect, useRef } from "react";

export default function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      canvas!.width = canvas!.offsetWidth;
      canvas!.height = canvas!.offsetHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const particles: { x: number; y: number; r: number; vx: number; vy: number; alpha: number; color: string }[] = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * (canvas.width || 1200),
        y: Math.random() * (canvas.height || 700),
        r: 0.5 + Math.random() * 1.5,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.1 - Math.random() * 0.3,
        alpha: 0.2 + Math.random() * 0.5,
        color: Math.random() > 0.5 ? "#00b4ff" : "#a67bd4",
      });
    }

    function drawGrid() {
      const spacing = 48;
      ctx!.strokeStyle = "rgba(0,100,160,0.12)";
      ctx!.lineWidth = 0.5;
      for (let x = 0; x < canvas!.width; x += spacing) {
        ctx!.beginPath(); ctx!.moveTo(x, 0); ctx!.lineTo(x, canvas!.height); ctx!.stroke();
      }
      for (let y = 0; y < canvas!.height; y += spacing) {
        ctx!.beginPath(); ctx!.moveTo(0, y); ctx!.lineTo(canvas!.width, y); ctx!.stroke();
      }
    }

    let animId: number;
    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      drawGrid();
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -5) { p.y = canvas!.height + 5; p.x = Math.random() * canvas!.width; }
        ctx!.save();
        ctx!.globalAlpha = p.alpha;
        ctx!.fillStyle = p.color;
        ctx!.shadowColor = p.color;
        ctx!.shadowBlur = 4;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      });
      animId = requestAnimationFrame(animate);
    }
    animId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

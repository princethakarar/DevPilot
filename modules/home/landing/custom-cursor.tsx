"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export default function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: -100, y: -100 });
  const currentRef = useRef({ x: -100, y: -100 });
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseEnter = () => setHovered(true);
    const onMouseLeave = () => setHovered(false);

    document.addEventListener("mousemove", onMouseMove);

    const updateInteractivity = () => {
      const els = document.querySelectorAll("a, button, [role='button'], .feat-card, .cf-item, .step-card, .price-card, .chat-pill");
      els.forEach((el) => {
        el.addEventListener("mouseenter", onMouseEnter);
        el.addEventListener("mouseleave", onMouseLeave);
      });
      return els;
    };

    let els = updateInteractivity();

    // Setup mutation observer to handle dynamically loaded content
    const observer = new MutationObserver(() => {
      els.forEach((el) => {
        el.removeEventListener("mouseenter", onMouseEnter);
        el.removeEventListener("mouseleave", onMouseLeave);
      });
      els = updateInteractivity();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    let animId: number;
    const tick = () => {
      const targetX = mouseRef.current.x;
      const targetY = mouseRef.current.y;

      // High performance lerp (0.45) for ultra-low latency but organic smoothness
      currentRef.current.x += (targetX - currentRef.current.x) * 0.45;
      currentRef.current.y += (targetY - currentRef.current.y) * 0.45;

      if (cursorRef.current) {
        // Offset by 16px to perfectly center the 32x32px cursor icon
        cursorRef.current.style.transform = `translate3d(${currentRef.current.x - 16}px, ${currentRef.current.y - 16}px, 0)`;
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      els.forEach((el) => {
        el.removeEventListener("mouseenter", onMouseEnter);
        el.removeEventListener("mouseleave", onMouseLeave);
      });
      observer.disconnect();
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      className="fixed top-0 left-0 pointer-events-none z-[10000] will-change-transform"
      style={{
        width: "32px",
        height: "32px",
      }}
    >
      <div
        className="w-full h-full transition-all duration-150 ease-out"
        style={{
          transform: hovered ? "scale(1.4)" : "scale(1)",
          filter: hovered 
            ? "drop-shadow(0 0 12px rgba(0, 207, 255, 0.95)) drop-shadow(0 0 6px rgba(0, 207, 255, 0.7))" 
            : "drop-shadow(0 0 6px rgba(0, 207, 255, 0.4))",
        }}
      >
        <Image
          src="/icon-bg-removed.png"
          alt="Cursor Rocket"
          width={32}
          height={32}
          className="w-full h-full object-contain"
          priority
        />
      </div>
    </div>
  );
}

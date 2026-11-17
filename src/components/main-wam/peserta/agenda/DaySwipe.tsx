"use client";

import { useRouter } from "next/navigation";
import { useRef, type PointerEvent, type ReactNode } from "react";

/**
 * Agenda's list, where a horizontal swipe moves a day (P03: "Geser kiri/kanan juga berpindah hari").
 * The day tabs above it are the button alternative (WCAG 2.5.1); vertical scrolling stays the
 * browser's (touch-action: pan-y). No animation, so nothing to reduce for reduced motion.
 */
export function DaySwipe({ prev, next, children, className }: { prev: string | null; next: string | null; children: ReactNode; className?: string }) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    start.current = { x: event.clientX, y: event.clientY, at: performance.now() };
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    const from = start.current;
    start.current = null;
    if (!from) return;
    const dx = event.clientX - from.x, dy = event.clientY - from.y;
    const quick = performance.now() - from.at < 600;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5 || !quick) return;
    const target = dx < 0 ? next : prev;
    if (target) router.push(target, { scroll: false });
  }
  return <div className={className} style={{ touchAction: "pan-y" }} onPointerDown={down} onPointerUp={up} onPointerCancel={() => { start.current = null; }}>
    {children}
  </div>;
}

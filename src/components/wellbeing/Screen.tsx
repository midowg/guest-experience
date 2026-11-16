"use client";

import { useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import css from "./wellbeing.module.css";

/*
 * One tab of the app (17 Nov 2026): a bar whose title appears once the large title has scrolled
 * away, and its own scroll area, so each tab keeps where it was. Pull down at the top to refresh.
 * Tabs stay mounted; an inactive one is hidden and inert (see WellbeingApp).
 */
export function Screen({ title, active, onRefresh, refreshing, scrollRef, children }: {
  title: string;
  active: boolean;
  onRefresh: () => Promise<unknown>;
  refreshing: boolean;
  scrollRef: (element: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [pulling, setPulling] = useState<{ distance: number; spinning: boolean }>({ distance: 0, spinning: false });
  const start = useRef<number | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  function onTouchStart(event: React.TouchEvent) {
    if (pulling.spinning || (scroller.current?.scrollTop ?? 0) > 0) { start.current = null; return; }
    start.current = event.touches[0].clientY;
  }
  function onTouchMove(event: React.TouchEvent) {
    if (start.current === null) return;
    const distance = Math.max(0, Math.min(120, event.touches[0].clientY - start.current));
    setPulling({ distance, spinning: false });
  }
  async function onTouchEnd() {
    if (start.current === null) return;
    start.current = null;
    if (pulling.distance > 72) {
      setPulling({ distance: 72, spinning: true });
      try { await onRefresh(); } finally { setPulling({ distance: 0, spinning: false }); }
    } else setPulling({ distance: 0, spinning: false });
  }

  const shown = pulling.spinning || pulling.distance > 0;
  return <section className={css.screen} data-active={active} aria-hidden={!active} inert={!active} aria-label={title}>
    <header className={css.bar} data-scrolled={scrolled}>
      <h1 className={css.barTitle}>{title}</h1>
      {refreshing && !pulling.spinning && <span className={css.barBusy} role="status" aria-label="Memperbarui"><span className={css.spin} style={{ width: 16, height: 16 }} /></span>}
    </header>
    <div className={css.ptr} data-spinning={pulling.spinning} aria-hidden="true"
      style={shown ? { opacity: Math.min(1, pulling.distance / 64), transform: `translate(-50%, ${pulling.distance * 0.6}px) rotate(${pulling.spinning ? 0 : pulling.distance * 3}deg)` } : undefined}>
      <RefreshCw size={20} />
    </div>
    <div className={css.scroll} data-scroller=""
      ref={element => { scroller.current = element; scrollRef(element); }}
      onScroll={event => { const next = event.currentTarget.scrollTop > 36; if (next !== scrolled) setScrolled(next); }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => void onTouchEnd()} onTouchCancel={() => { start.current = null; setPulling({ distance: 0, spinning: false }); }}>
      <div className={css.content}>{children}</div>
    </div>
  </section>;
}

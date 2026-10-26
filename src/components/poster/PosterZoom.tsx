"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minus, Plus, X } from "lucide-react";
import { posterSizes, type PosterFormat } from "@/lib/poster";
import s from "./card-zoom.module.css";

/** How large the card is drawn, as a multiple of fitting the screen. */
const levels = [1, 1.5, 2, 3] as const;
const levelLabel = (level: number) => level === 1 ? "Pas layar" : `${String(level).replace(".", ",")}×`;

/**
 * A button that opens the card full screen, to check that every text fits: fitted to the screen
 * first, then larger in steps, scrolled (or dragged with a finger) to the part being checked.
 * `children` is the card to show, drawn only while open.
 */
export function PosterZoom({ format, className = "", children }: { format: PosterFormat; className?: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(0);
  const [fit, setFit] = useState(0);
  const { width, height } = posterSizes[format];

  useEffect(() => {
    const node = dialog.current;
    if (!node || !open) return;
    if (typeof node.showModal === "function") node.showModal(); else node.setAttribute("open", "");
  }, [open]);
  // The card as large as the screen allows, by width or by height, before any zoom.
  useEffect(() => {
    const node = stage.current;
    if (!node || !open) return;
    const measure = () => setFit(Math.max(120, Math.min(node.clientWidth - 32, (node.clientHeight - 32) * width / height)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, width, height]);

  const close = () => { dialog.current?.close?.(); setOpen(false); };
  const step = (by: number) => setLevel(current => Math.min(levels.length - 1, Math.max(0, current + by)));

  return <>
    <button type="button" className={`${s.open} ${className}`} onClick={() => { setLevel(0); setOpen(true); }}><Maximize2 size={16} aria-hidden="true" /> Perbesar</button>
    {open && <dialog ref={dialog} className={s.dialog} aria-label="Kartu diperbesar" onClose={() => setOpen(false)} onCancel={() => setOpen(false)}>
      <div className={s.bar}>
        <span className={s.title}>Periksa kartu</span>
        <div className={s.zoom} role="group" aria-label="Perbesaran">
          <button type="button" onClick={() => step(-1)} disabled={level === 0} aria-label="Perkecil"><Minus size={16} aria-hidden="true" /></button>
          {levels.map((value, index) => <button key={value} type="button" aria-pressed={level === index} onClick={() => setLevel(index)}>{levelLabel(value)}</button>)}
          <button type="button" onClick={() => step(1)} disabled={level === levels.length - 1} aria-label="Perbesar lagi"><Plus size={16} aria-hidden="true" /></button>
        </div>
        <button type="button" className={s.close} onClick={close} aria-label="Tutup"><X size={20} aria-hidden="true" /></button>
      </div>
      <div ref={stage} className={s.stage}>
        {fit > 0 && <div className={s.card} style={{ width: Math.round(fit * levels[level]) }}>{children}</div>}
      </div>
    </dialog>}
  </>;
}

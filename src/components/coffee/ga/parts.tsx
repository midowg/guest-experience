"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, Minus, Plus } from "lucide-react";
import { coffeePath } from "@/lib/routes";
import css from "./ga.module.css";

/* Small pieces every screen of the tablet shares. */

export const SETTLE_MS = 450;
/**
 * A screen that has just appeared ignores presses for a moment: the second tap of a double tap was
 * aimed at the screen before it (the pengelola's queue lost an order to exactly that). `mark`
 * changes whenever what is under the finger changes.
 */
export function useSettled(mark: unknown = 0): () => boolean {
  const since = useRef(0);
  useEffect(() => { since.current = Date.now(); }, [mark]);
  return useCallback(() => Date.now() - since.current >= SETTLE_MS, []);
}

/** A drink of the menu, by its slug. Decorative: the name is always written next to it. */
export function Photo({ slug, width, height, className, alt = "" }: { slug: string; width: number; height: number; className?: string; alt?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- small local photos, sized here
  return <img className={className} src={coffeePath.photo(slug)} alt={alt} width={width} height={height} loading="lazy" draggable={false} />;
}

export function ScreenHead({ title, sub, onBack, backLabel, children }: { title: string; sub?: ReactNode; onBack: () => void; backLabel: string; children?: ReactNode }) {
  return (
    <div className={css.screenHead}>
      <button type="button" className={css.back} onClick={onBack}><ChevronLeft aria-hidden size={22} />{backLabel}</button>
      <div className={css.grow}>
        <h1>{title}</h1>
        {sub && <p className={css.muted}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * A search field that got the focus: bring it to the top of what scrolls, so the names to pick
 * from, which sit right under it, stay above the on-screen keyboard (audit F3-07). Waits for the
 * keyboard to come up.
 */
export function raiseOnFocus(element: HTMLElement | null) {
  const block = element?.closest<HTMLElement>("[data-raise]") ?? element;
  window.setTimeout(() => block?.scrollIntoView?.({ block: "start", behavior: "smooth" }), 250);
}

/** Minus, the number, plus. At `min` the minus rests, unless going below it means "none" (`min` 0). */
export function Stepper({ value, min = 0, max, onChange, labelledBy, name }: { value: number; min?: number; max: number; onChange: (value: number) => void; labelledBy?: string; name?: string }) {
  return (
    <span className={css.stepper} role="group" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : `Jumlah ${name ?? ""}`.trim()}>
      <button type="button" aria-label="Kurangi" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}><Minus aria-hidden size={18} /></button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label="Tambah" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}><Plus aria-hidden size={18} /></button>
    </span>
  );
}

export function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" className={css.option} aria-pressed={on} onClick={onClick}>{children}</button>;
}

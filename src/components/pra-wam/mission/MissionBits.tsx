"use client";

import { useEffect, useRef } from "react";
import { Bus } from "lucide-react";
import css from "./mission.module.css";

/** Where the bus is, in words: the big scene and the small bar say the same (27 Nov 2026). */
export function tripStatus({ done, missions, arrived }: { done: number; missions: number; arrived: boolean }): string {
  if (arrived) return "Sudah tiba di Villa Cangkringan";
  if (done >= missions) return "Semua misi selesai · hampir sampai";
  return `Di perjalanan · ${done} dari ${missions} misi selesai`;
}

/** A person whose face is a question mark: the roommate not known yet (27 Nov 2026). */
export function MysteryPerson({ size = 56, label }: { size?: number; label?: string }) {
  return <svg className={css.mysteryIcon} width={size} height={size} viewBox="0 0 64 64" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
    <circle cx="32" cy="32" r="31" className={css.mysteryBg} />
    <circle cx="32" cy="25" r="13" className={css.mysteryHead} />
    <path d="M10 56 C13 43 22 39 32 39 C42 39 51 43 54 56 Z" className={css.mysteryHead} />
    <text x="32" y="31" textAnchor="middle" className={css.mysteryMark}>?</text>
  </svg>;
}

/**
 * The trip, small (27 Nov 2026), like a music player's bar: shown once the big scene is scrolled
 * away, under the app's own sticky top bar when there is one, the bus riding the bar as the
 * progress thumb.
 */
export function MissionMiniBar({ percent, status, shown }: { percent: number; status: string; shown: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Below a sticky top bar of the app (Kelola acara's phone bar), never over its back arrow.
    const place = () => {
      const top = [...document.querySelectorAll<HTMLElement>("header")].find(header => {
        const style = getComputedStyle(header);
        return (style.position === "sticky" || style.position === "fixed") && header.getBoundingClientRect().top <= 1 && header.offsetHeight > 0 && !bar.current?.contains(header);
      });
      if (bar.current) bar.current.style.top = `${(top?.offsetHeight ?? 0) + 8}px`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);
  return <div ref={bar} className={`${css.mini} ${shown ? css.miniShown : ""}`} aria-hidden={!shown}>
    <span className={css.miniIcon}><Bus aria-hidden /></span>
    <div className={css.miniText}>
      <b>{status}</b>
      <div className={css.miniTrack} role="progressbar" aria-label="Perjalanan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span className={css.miniFill} style={{ width: `${percent}%` }} />
        <span className={css.miniBus} style={{ left: `${percent}%` }}><Bus aria-hidden /></span>
      </div>
      <small><span>Kantor</span><span>Villa Cangkringan</span></small>
    </div>
  </div>;
}

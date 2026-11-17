"use client";

import { useId } from "react";
import css from "./wellbeing.module.css";

/*
 * The streak flame (18 Nov 2026), as in Duolingo: lit (orange, flickering a little) once today has a
 * counted activity, an outline only (as if switched off) while today has none. `ignite` plays the
 * lighting once (after the first activity of the day). Decorative: the text next to it says the state.
 */

const OUTER = "M16 1C17.2 7.5 22.5 10.5 25.6 15.4C27.6 18.5 28.5 21.6 28.5 25C28.5 33 22.9 39 16 39C9.1 39 3.5 33 3.5 25.5C3.5 20.6 5.6 16.6 8.6 13.6C8.9 17 10.4 19.4 12.6 20.4C11.6 13.4 12.8 6.4 16 1Z";
const INNER = "M16 18.5C17.6 22 21.5 24 21.5 29C21.5 33 19 36 16 36C13 36 10.5 33.4 10.5 30C10.5 27.6 11.6 25.6 13.2 24.3C13.4 26 14.2 27.2 15.3 27.8C14.8 24.6 15 21.4 16 18.5Z";

export function StreakFlame({ lit, size = 40, ignite = false }: { lit: boolean; size?: number; ignite?: boolean }) {
  // Gradient ids for url(#…): letters, digits, "-" and "_" only.
  const id = `flame${useId().replace(/[^\w-]/g, "")}`;
  return <span className={css.flame} data-lit={lit} data-ignite={ignite || undefined} style={{ width: size * 0.8, height: size }} aria-hidden="true">
    <svg viewBox="0 0 32 40" width={size * 0.8} height={size}>
      {lit && <defs>
        <linearGradient id={`${id}o`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFC21A" /><stop offset="1" stopColor="#FF6B00" /></linearGradient>
        <linearGradient id={`${id}i`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE76A" /><stop offset="1" stopColor="#FFF8D6" /></linearGradient>
      </defs>}
      <path className={css.flameOuter} d={OUTER} fill={lit ? `url(#${id}o)` : "none"} />
      {lit && <path className={css.flameInner} d={INNER} fill={`url(#${id}i)`} />}
    </svg>
  </span>;
}

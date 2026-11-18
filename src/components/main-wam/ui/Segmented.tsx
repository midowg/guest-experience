"use client";

import { useRef, type KeyboardEvent } from "react";
import { cx, KitIcon, type IconProp } from "./Pressable";
import css from "./segmented.module.css";

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: IconProp; disabled?: boolean };

/**
 * SegmentedControl (DS #7): two to four choices of one view ("Semua | Kelompokku"). A radio group
 * (WAI-ARIA APG): one stop in the Tab order (the chosen one), arrow keys move and choose, Home/End
 * go to the ends, and it wraps around. For tabs that switch
 * whole panels, keep this and render the panel under it (no tabpanel wiring needed for a filter).
 */
export function Segmented<T extends string>({ options, value, onChange, label, className }: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Spoken name of the group ("Tampilkan foto"). */
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.map((option, index) => ({ option, index })).filter(entry => !entry.option.disabled);
  const selectedIndex = options.findIndex(option => option.value === value);
  // The one Tab stop: the chosen segment, or the first one that can be chosen.
  const tabStop = selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : enabled[0]?.index ?? -1;

  function move(from: number, step: number | "first" | "last") {
    if (enabled.length === 0) return;
    const position = enabled.findIndex(entry => entry.index === from);
    let next: number;
    if (step === "first") next = 0;
    else if (step === "last") next = enabled.length - 1;
    else next = (Math.max(position, 0) + step + enabled.length) % enabled.length;
    const target = enabled[next];
    refs.current[target.index]?.focus();
    if (target.option.value !== value) onChange(target.option.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number | "first" | "last"> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: "first", End: "last" };
    const step = keys[event.key];
    if (step === undefined) return;
    event.preventDefault();
    move(index, step);
  }

  return <div role="radiogroup" aria-label={label} className={cx(css.track, className)}>
    {options.map((option, index) => <button key={option.value} ref={element => { refs.current[index] = element; }} type="button" role="radio"
      aria-checked={option.value === value} tabIndex={index === tabStop ? 0 : -1} disabled={option.disabled}
      className={css.item} onClick={() => { if (option.value !== value) onChange(option.value); }} onKeyDown={event => onKeyDown(event, index)}>
      <KitIcon icon={option.icon} />
      <span className={css.itemLabel}>{option.label}</span>
    </button>)}
  </div>;
}

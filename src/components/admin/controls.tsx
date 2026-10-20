"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Undo2 } from "lucide-react";
import styles from "./admin.module.css";

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className={styles.toggle}>
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    <span className={`${styles.toggleSwitch} ${checked ? styles.toggleOn : styles.toggleOff}`}>
      <span className={styles.toggleKnob} />
    </span>
    <span className={styles.toggleText}>{label}</span>
    <span className={`${styles.toggleBadge} ${checked ? styles.toggleBadgeOn : styles.toggleBadgeOff}`}>{checked ? "Aktif" : "Nonaktif"}</span>
  </label>;
}

export function OrderButtons({ label, index, length, onMove }: { label: string; index: number; length: number; onMove: (direction: -1 | 1) => void }) {
  return <div className={styles.orderGroup}>
    <button type="button" className={styles.orderBtn} disabled={index === 0} aria-label={`Naikkan ${label}`} onClick={() => onMove(-1)}>
      <ArrowUp size={20} aria-hidden="true" />
      <span className={styles.orderBtnText}>Naik</span>
    </button>
    <button type="button" className={styles.orderBtn} disabled={index === length - 1} aria-label={`Turunkan ${label}`} onClick={() => onMove(1)}>
      <ArrowDown size={20} aria-hidden="true" />
      <span className={styles.orderBtnText}>Turun</span>
    </button>
  </div>;
}

/**
 * Known answers for a field as chips: one click replaces the field's text. When that click
 * overwrote something the admin had typed, a link brings the typed text back.
 */
export function SuggestionChips({ field, options, value, onPick }: { field: string; options: { label: string; value: string }[]; value: string; onPick: (value: string) => void }) {
  const [previous, setPrevious] = useState<{ text: string; replacedBy: string } | null>(null);
  const known = options.some(option => option.value === value);
  return <div className={styles.chips} role="group" aria-label={`Pilihan cepat: ${field}`}>
    {options.map(option => <button key={option.value} type="button" className={styles.chip} title={option.value} aria-pressed={option.value === value}
      onClick={() => { setPrevious(value.trim() && !known ? { text: value, replacedBy: option.value } : null); onPick(option.value); }}>
      {option.label}
    </button>)}
    {previous && previous.replacedBy === value && <button type="button" className={styles.chipUndo} onClick={() => { onPick(previous.text); setPrevious(null); }}>
      <Undo2 size={14} aria-hidden="true" /> Kembalikan teks sebelumnya
    </button>}
  </div>;
}

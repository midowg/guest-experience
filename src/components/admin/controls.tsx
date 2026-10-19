"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
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

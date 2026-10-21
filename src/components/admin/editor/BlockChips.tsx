"use client";

import { useEffect, useRef, useState } from "react";
import n from "./block-numbers.module.css";

export type BlockChip = { id: string; title: string; short: string; status?: "todo" | "error" | "dirty"; statusLabel?: string };

/**
 * The switched-on modules as numbered chips, a quick jump without opening ☰. With names when they
 * all fit on one row ("1 Rundown"), otherwise numbers only, the open one keeping its name. A hidden
 * copy with every name measures the fit, so the choice never depends on what is showing.
 */
export function BlockChips({ chips, current, onOpen }: { chips: BlockChip[]; current: string; onOpen: (id: string) => void }) {
  const list = useRef<HTMLOListElement>(null);
  const full = useRef<HTMLOListElement>(null);
  const [named, setNamed] = useState(false);

  useEffect(() => {
    const room = list.current, need = full.current;
    if (!room || !need) return;
    const fit = () => setNamed(need.scrollWidth <= room.clientWidth);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(room); observer.observe(need);
    return () => observer.disconnect();
    // A change in the chips resizes the hidden copy, which the observer sees.
  }, []);

  const chip = (item: BlockChip, index: number, measure = false) => {
    const here = item.id === current;
    const content = <>
      <span className={n.chipNumber}>{index + 1}</span>
      {(measure || named || here) && <span className={n.chipName}>{item.short}</span>}
      {item.status && <span className={n.chipDot} data-status={item.status} aria-hidden="true" />}
    </>;
    if (measure) return <li key={item.id}><span className={n.chip}>{content}</span></li>;
    return <li key={item.id}><button type="button" className={n.chip} aria-current={here ? "true" : undefined} title={item.title} aria-label={`Modul ${index + 1}: ${item.title}${item.statusLabel ? `, ${item.statusLabel.toLowerCase()}` : ""}`} onClick={() => onOpen(item.id)}>{content}</button></li>;
  };

  return <>
    <ol ref={list} className={n.chips} aria-label="Modul aktif">{chips.map((item, index) => chip(item, index))}</ol>
    <ol ref={full} className={`${n.chips} ${n.measure}`} aria-hidden="true">{chips.map((item, index) => chip(item, index, true))}</ol>
  </>;
}

"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import css from "./console.module.css";

export type PaletteItem = { key: string; label: string; href: string; sub?: string; icon?: ReactNode; external?: boolean };

const fold = (text: string) => text.toLocaleLowerCase("id").normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** The items whose name (or line) holds every word typed; names that start with it come first. */
export function filterPalette(items: readonly PaletteItem[], query: string, limit = 50): PaletteItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return items.slice(0, limit);
  const matches = items.filter(item => {
    const hay = fold(`${item.label} ${item.sub ?? ""}`);
    return words.every(word => hay.includes(word));
  });
  const first = words[0];
  return [...matches.filter(item => fold(item.label).startsWith(first)), ...matches.filter(item => !fold(item.label).startsWith(first))].slice(0, limit);
}

/**
 * "Cari halaman atau orang": a native dialog with a search box over the menu (and whatever else
 * the area passes in). Arrows move, Enter or a click opens, Esc or the dimmed page closes; focus
 * goes back to where it was.
 */
export function CommandPalette({ open, onClose, items, placeholder = "Cari halaman atau orang" }: { open: boolean; onClose: () => void; items: readonly PaletteItem[]; placeholder?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
      // Here rather than in the body: the body's effects run first and would be remembered as "where it was".
      element.querySelector("input")?.focus();
    }
    if (!open && element.open) {
      element.close();
      returnTo.current?.focus();
    }
  }, [open]);

  return <dialog ref={dialog} className={css.palette} aria-label={placeholder}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === dialog.current) onClose(); }}>
    {open && <PaletteBody items={items} placeholder={placeholder} onClose={onClose} />}
  </dialog>;
}

function PaletteBody({ items, placeholder, onClose }: { items: readonly PaletteItem[]; placeholder: string; onClose: () => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const results = useMemo(() => filterPalette(items, query), [items, query]);
  const index = results.length ? Math.min(active, results.length - 1) : -1;
  const optionId = (at: number) => `${id}-option-${at}`;

  useEffect(() => {
    if (index >= 0) document.getElementById(optionId(index))?.scrollIntoView?.({ block: "nearest" });
  });

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!results.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((index + 1) % results.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index - 1 + results.length) % results.length); }
    else if (event.key === "Home") { event.preventDefault(); setActive(0); }
    else if (event.key === "End") { event.preventDefault(); setActive(results.length - 1); }
    else if (event.key === "Enter") { event.preventDefault(); document.getElementById(optionId(index))?.click(); }
  }

  return <div className={css.paletteInner}>
    <div className={css.paletteSearch}>
      <Search size={20} aria-hidden="true" />
      <input type="text" className={css.paletteInput} placeholder={placeholder} aria-label={placeholder}
        role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={index >= 0 ? optionId(index) : undefined}
        value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={onKeyDown} />
      <button type="button" className={`${css.iconButton} ${css.closeButton}`} aria-label="Tutup pencarian" onClick={onClose}><X size={20} aria-hidden="true" /></button>
    </div>
    {results.length === 0 && <p className={css.paletteEmpty} role="status">Tidak ada yang cocok dengan “{query.trim()}”.</p>}
    <ul id={`${id}-list`} role="listbox" aria-label="Hasil" className={css.paletteList} hidden={results.length === 0}>
      {results.map((item, at) => <li key={item.key} role="presentation">
        <a id={optionId(at)} role="option" aria-selected={at === index} href={item.href} className={css.option} tabIndex={-1}
          target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined}
          onMouseMove={() => { if (at !== index) setActive(at); }} onClick={onClose}>
          {item.icon && <span className={css.itemIcon} aria-hidden="true">{item.icon}</span>}
          <span className={css.optionLabel}>{item.label}{item.external && <span className="sr-only"> (tab baru)</span>}</span>
          {item.sub && <span className={css.optionSub}>{item.sub}</span>}
        </a>
      </li>)}
    </ul>
    <p className={css.paletteHint} aria-hidden="true"><span>↑ ↓ pilih</span><span>Enter buka</span><span>Esc tutup</span></p>
  </div>;
}

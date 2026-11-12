"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { stripRun, TV_ROWS, type TvStripPhoto } from "@/lib/pra-wam/tv";
import css from "./tv.module.css";

/**
 * The photo row of a TV laid out in two rows: the photos side by side at the row's height, running
 * from right to left without stopping, slowly. The run is drawn twice and moved by half its width,
 * so its end meets its start and nothing jumps. On a TV standing up the row is tall and narrow, so
 * the photos run in two lines (`lines`), every other photo in each, the lower one a little slower
 * so the two do not move as one. While an item needs the whole screen the row is `hidden` but
 * stays in place, so it goes on from where it was.
 */
export function TvStrip({ photos, hidden = false, lines = 1 }: { photos: readonly TvStripPhoto[]; hidden?: boolean; lines?: 1 | 2 }) {
  if (!photos.length) return null;
  const split = lines === 2 && photos.length > 1;
  const groups = split ? [photos.filter((_, index) => index % 2 === 0), photos.filter((_, index) => index % 2 === 1)] : [photos];
  return <aside className={css.strip} data-hidden={hidden} data-lines={groups.length} aria-label="Foto kegiatan" aria-hidden={hidden || undefined}>
    {groups.map((group, line) => {
      const run = stripRun(group);
      const list = (copy: number) => <ul className={css.stripRun} aria-hidden={copy > 0 || undefined}>
        {run.map((photo, index) => <li key={`${copy}-${index}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.src} alt={copy > 0 ? "" : photo.title || "Foto kegiatan"} referrerPolicy="no-referrer" decoding="async" />
        </li>)}
      </ul>;
      return <div key={line} className={css.stripLine}>
        <div className={css.stripTrack} style={{ animationDuration: `${Math.round(run.length * TV_ROWS.secondsPerPhoto * (line ? 1.15 : 1))}s` }}>{list(0)}{list(1)}</div>
      </div>;
    })}
  </aside>;
}

/**
 * The same photos on a phone: a row to swipe through by hand, and a touch on a photo opens it
 * large, with the one before and the one after a touch away. Nothing moves by itself.
 */
export function PhonePhotos({ photos }: { photos: readonly TvStripPhoto[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const count = photos.length;
  const shown = open != null && open < count ? photos[open] : null;
  useEffect(() => {
    if (open == null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
      if (event.key === "ArrowLeft") setOpen(value => (value == null ? value : (value - 1 + count) % count));
      if (event.key === "ArrowRight") setOpen(value => (value == null ? value : (value + 1) % count));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, count]);
  if (!count) return null;
  return <section className={css.phonePhotos} aria-label="Foto kegiatan">
    <h2>Foto kegiatan<span>{count} foto</span></h2>
    <ul>
      {photos.map((photo, index) => <li key={photo.id}>
        <button type="button" aria-label={`Buka foto ${index + 1} dari ${count}${photo.title ? `: ${photo.title}` : ""}`} onClick={() => setOpen(index)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.src} alt="" loading="lazy" referrerPolicy="no-referrer" />
        </button>
      </li>)}
    </ul>
    {shown && open != null && <div className={css.phoneViewer} role="dialog" aria-modal="true" aria-label={`Foto ${open + 1} dari ${count}`}>
      <header>
        <p>{open + 1} / {count}</p>
        <button type="button" aria-label="Tutup foto" onClick={() => setOpen(null)}><X size={22} aria-hidden="true" /></button>
      </header>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shown.src} alt={shown.title || "Foto kegiatan"} referrerPolicy="no-referrer" />
      <footer>
        <button type="button" aria-label="Foto sebelumnya" disabled={count < 2} onClick={() => setOpen((open - 1 + count) % count)}><ChevronLeft size={22} aria-hidden="true" /></button>
        <p>{shown.title}</p>
        <button type="button" aria-label="Foto berikutnya" disabled={count < 2} onClick={() => setOpen((open + 1) % count)}><ChevronRight size={22} aria-hidden="true" /></button>
      </footer>
    </div>}
  </section>;
}

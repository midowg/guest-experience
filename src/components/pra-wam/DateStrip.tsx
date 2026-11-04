"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Ban, ChevronLeft, ChevronRight } from "lucide-react";
import { dayLabel } from "@/lib/pra-wam/appraisal";
import { stripDay, type DaySummary } from "@/lib/pra-wam/room-day";
import css from "./date-strip.module.css";

type Props = {
  /** The weekdays of the booking window, in order. */
  days: string[];
  selected: string;
  today: string;
  /** Per date: how many holds and whether every room is full; a missing date shows no count. */
  summary?: Record<string, DaySummary>;
  onPick: (date: string) => void;
  label?: string;
};

const utc = (date: string) => new Date(`${date}T12:00:00Z`);
const shortDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(utc(date));
const monthShort = (date: string) => new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(utc(date));
const still = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Every weekday of the booking window in one row that scrolls sideways (touch, trackpad, or a
 * mouse wheel turned into sideways scrolling), with no scrollbar: soft edges show there is more,
 * and from a desktop pointer two arrows page through it. Each day says its state in words, not
 * only colour: "Lewat" (past, dimmed and struck through, not pickable), "Hari ini" (a ring and a
 * dot, even when not picked), "Penuh" (every room full), "2 terpakai", or "Kosong"; the picked day
 * is filled. A month's name stands where it begins. One tab stop: the arrow keys, Home and End move
 * between days. On load the picked day (else today) scrolls into view.
 */
export function DateStrip({ days, selected, today, summary, onPick, label = "Pilih tanggal" }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const focusDay = days.includes(selected) ? selected : days.includes(today) ? today : days.find(day => day >= today) ?? days[0];

  const measure = useCallback(() => {
    const box = scroller.current;
    if (!box) return;
    const start = box.scrollLeft <= 1, end = box.scrollLeft + box.clientWidth >= box.scrollWidth - 1;
    setEdges(current => current.start === start && current.end === end ? current : { start, end });
  }, []);

  /** Brings a day into view, centred; only when it is (partly) out of view unless `always`. */
  const reveal = useCallback((date: string, smooth: boolean, always = false) => {
    const box = scroller.current;
    const item = box?.querySelector<HTMLElement>(`[data-date="${date}"]`);
    if (!box || !item) return;
    const hidden = item.offsetLeft < box.scrollLeft || item.offsetLeft + item.offsetWidth > box.scrollLeft + box.clientWidth;
    if (!always && !hidden) return;
    const left = Math.max(0, item.offsetLeft - (box.clientWidth - item.offsetWidth) / 2);
    if (typeof box.scrollTo === "function") box.scrollTo({ left, behavior: smooth && !still() ? "smooth" : "auto" });
    else box.scrollLeft = left;
  }, []);

  // On load: the picked day (else today) in the middle, without an animation.
  const target = days.includes(selected) ? selected : today;
  const first = useRef(true);
  useEffect(() => {
    reveal(target, !first.current, first.current);
    first.current = false;
    measure();
  }, [target, reveal, measure]);

  // A vertical wheel scrolls the row sideways while it can; at either end the page scrolls on.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const max = box.scrollWidth - box.clientWidth;
      const step = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      const next = Math.max(0, Math.min(max, box.scrollLeft + step));
      if (max <= 0 || next === box.scrollLeft) return;
      event.preventDefault();
      box.scrollLeft = next;
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", measure);
    return () => { box.removeEventListener("wheel", onWheel); window.removeEventListener("resize", measure); };
  }, [measure]);

  function page(direction: -1 | 1) {
    const box = scroller.current;
    if (!box) return;
    const shift = direction * box.clientWidth * 0.8;
    if (typeof box.scrollBy === "function") box.scrollBy({ left: shift, behavior: still() ? "auto" : "smooth" });
    else box.scrollLeft += shift;
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const to = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? days.length - 1 : null;
    if (to == null || to < 0 || to >= days.length) return;
    event.preventDefault();
    scroller.current?.querySelector<HTMLElement>(`[data-date="${days[to]}"]`)?.focus();
  }

  return <div className={css.wrap} data-start={edges.start || undefined} data-end={edges.end || undefined}>
    <button type="button" className={`${css.arrow} ${css.prev}`} onClick={() => page(-1)} disabled={edges.start} aria-label="Tanggal sebelumnya"><ChevronLeft aria-hidden /></button>
    <div ref={scroller} className={css.scroller} role="group" aria-label={label} onScroll={measure}>
      {days.map((date, index) => {
        const day = stripDay(date, { today, selected, summary: summary?.[date] });
        const month = index === 0 || monthShort(days[index - 1]) !== monthShort(date);
        const spoken = [dayLabel(date), day.today ? "hari ini" : "", day.note.toLowerCase()].filter(Boolean).join(", ");
        const tone = day.past ? css.past : day.full ? css.full : "";
        return <Fragment key={date}>
          {month && <span className={css.month} aria-hidden>{monthShort(date)}</span>}
          <button type="button" data-date={date} className={`${css.day} ${tone} ${day.today ? css.today : ""}`}
            aria-pressed={day.selected} aria-disabled={day.past || undefined} aria-current={day.today ? "date" : undefined} aria-label={spoken}
            tabIndex={date === focusDay ? 0 : -1} onKeyDown={event => onKey(event, index)} onClick={() => { if (!day.past) onPick(date); }}>
            <span className={css.name}>{day.today && <i className={css.dot} aria-hidden />}{day.today ? "Hari ini" : shortDay(date)}</span>
            <strong className={css.number}>{Number(date.slice(8, 10))}</strong>
            <span className={css.note}>{day.full && <Ban aria-hidden />}{day.note || " "}</span>
          </button>
        </Fragment>;
      })}
    </div>
    <button type="button" className={`${css.arrow} ${css.next}`} onClick={() => page(1)} disabled={edges.end} aria-label="Tanggal berikutnya"><ChevronRight aria-hidden /></button>
  </div>;
}

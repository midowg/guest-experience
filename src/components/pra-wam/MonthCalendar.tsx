"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayLabel, isWorkday } from "@/lib/pra-wam/appraisal";
import type { DaySummary } from "@/lib/pra-wam/room-day";
import css from "./month-calendar.module.css";

type Props = {
  /** The booking window, first and last date (weekdays only are pickable). */
  from: string; to: string;
  selected: string; today: string;
  /** Per weekday of the window: holds, full and crowded (windowSummary); a missing date shows no dot. */
  summary?: Record<string, DaySummary>;
  /** Dates on which the viewer has a booking (booked or joined). */
  mine?: string[];
  onPick: (date: string) => void;
  label?: string;
};

const utc = (date: string) => new Date(`${date}T12:00:00Z`);
const iso = (day: Date) => day.toISOString().slice(0, 10);
const monthOf = (date: string) => date.slice(0, 7);
const shift = (date: string, days: number) => { const day = utc(date); day.setUTCDate(day.getUTCDate() + days); return iso(day); };
const shiftMonth = (month: string, by: number) => { const day = utc(`${month}-01`); day.setUTCMonth(day.getUTCMonth() + by); return iso(day).slice(0, 7); };
const fmt = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" }).format(utc(date));
const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** The weeks (Sunday to Saturday) of `month` that touch the window; days of other months are null. */
export function monthWeeks(month: string, from: string, to: string): (string | null)[][] {
  const first = `${month}-01`;
  const sunday = shift(first, -utc(first).getUTCDay());
  const weeks: (string | null)[][] = [];
  for (let start = sunday; monthOf(start) <= month; start = shift(start, 7)) {
    const days = Array.from({ length: 7 }, (_, index) => shift(start, index));
    if (days.at(-1)! < from || days[0] > to) continue;
    weeks.push(days.map(day => monthOf(day) === month ? day : null));
  }
  return weeks;
}

/** What a day of the month calendar is: pickable or why not, and its dots. */
export function monthDay(date: string, at: { from: string; to: string; today: string; summary?: DaySummary; mine: boolean }) {
  const outside = date < at.from || date > at.to;
  const weekend = !isWorkday(date);
  const past = date < at.today;
  const open = !outside && !weekend && !past;
  // Dots only on days that can still be picked: yours (blue), a room nearly full (orange), all free (green).
  const dots = !open ? [] : [
    at.mine ? "mine" as const : null,
    at.summary && (at.summary.crowded || at.summary.full) ? "crowded" as const : null,
    at.summary && at.summary.bookings === 0 ? "free" as const : null,
  ].filter(dot => dot != null);
  const why = outside ? "di luar periode" : weekend ? "akhir pekan" : past ? "lewat" : "";
  return { open, past, weekend, outside, dots, why };
}

const DOT_WORDS = { mine: "ada booking kamu", crowded: "ada ruang hampir penuh", free: "semua ruang kosong" } as const;

/**
 * DS "Kalender · tanggal terpilih": a month card, the picked date as a filled blue circle, today
 * with a blue ring, dots under the dates (blue: a booking of yours, orange: a room nearly full,
 * green: every room free). Past days, weekends and days outside the booking window are muted and
 * cannot be picked. ‹ › page by month inside the window; only the weeks that touch the window show.
 * One tab stop: the arrow keys move a day or a week, Home and End to the week's ends.
 */
export function MonthCalendar({ from, to, selected, today, summary, mine = [], onPick, label = "Pilih tanggal" }: Props) {
  const clamp = (month: string) => month < monthOf(from) ? monthOf(from) : month > monthOf(to) ? monthOf(to) : month;
  const [month, setMonth] = useState(() => clamp(monthOf(selected)));
  // A day picked elsewhere (the week arrows, the address) brings its month.
  const [seen, setSeen] = useState(selected);
  if (seen !== selected) { setSeen(selected); setMonth(clamp(monthOf(selected))); }
  const grid = useRef<HTMLDivElement>(null);
  const mineSet = new Set(mine);

  const weeks = monthWeeks(month, from, to);
  const dates = weeks.flat().filter((day): day is string => !!day);
  const focusDay = dates.includes(selected) ? selected : dates.find(day => monthDay(day, { from, to, today, mine: false }).open) ?? dates[0];
  const inMonth = monthOf(selected) === month;
  const monthName = fmt(`${month}-01`, { month: "long", year: "numeric" });

  function onKey(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const weekStart = shift(date, -utc(date).getUTCDay());
    const moves: Record<string, string> = {
      ArrowRight: shift(date, 1), ArrowLeft: shift(date, -1), ArrowDown: shift(date, 7), ArrowUp: shift(date, -7),
      Home: weekStart, End: shift(weekStart, 6),
    };
    const target = moves[event.key];
    if (!target) return;
    event.preventDefault();
    if (!dates.includes(target)) return;
    grid.current?.querySelector<HTMLElement>(`[data-date="${target}"]`)?.focus();
  }

  return <section className={css.card} aria-label={label}>
    <header className={css.head}>
      <h2 className={css.title}>
        {inMonth
          ? <><strong>{fmt(selected, { day: "numeric", month: "short" })}</strong><span>{fmt(selected, { weekday: "long" })}</span></>
          : <><strong>{fmt(`${month}-01`, { month: "long" })}</strong><span>{month.slice(0, 4)}</span></>}
      </h2>
      <span className={css.srOnly} aria-live="polite">{monthName}</span>
      <div className={css.nav}>
        <button type="button" className={css.arrow} onClick={() => setMonth(shiftMonth(month, -1))} disabled={month <= monthOf(from)} aria-label="Bulan sebelumnya"><ChevronLeft aria-hidden /></button>
        <button type="button" className={css.arrow} onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= monthOf(to)} aria-label="Bulan berikutnya"><ChevronRight aria-hidden /></button>
      </div>
    </header>
    <div className={css.weekdays} aria-hidden>{WEEKDAYS.map(name => <span key={name}>{name}</span>)}</div>
    <div ref={grid} className={css.grid} role="group" aria-label={`${label}, ${monthName}`}>
      {weeks.flat().map((date, index) => {
        if (!date) return <span key={`kosong-${index}`} className={css.blank} aria-hidden />;
        const day = monthDay(date, { from, to, today, summary: summary?.[date], mine: mineSet.has(date) });
        const isToday = date === today, isSelected = date === selected;
        const spoken = [dayLabel(date), isToday ? "hari ini" : "", day.why, ...day.dots.map(dot => DOT_WORDS[dot])].filter(Boolean).join(", ");
        return <button key={date} type="button" data-date={date}
          className={`${css.day} ${day.open ? "" : css.muted} ${isToday ? css.today : ""}`}
          aria-pressed={isSelected} aria-disabled={!day.open || undefined} aria-current={isToday ? "date" : undefined} aria-label={spoken}
          tabIndex={date === focusDay ? 0 : -1} onKeyDown={event => onKey(event, date)} onClick={() => { if (day.open) onPick(date); }}>
          <span className={css.number}>{Number(date.slice(8, 10))}</span>
          <span className={css.dots} aria-hidden>{day.dots.map(dot => <i key={dot} className={css[dot]} />)}</span>
        </button>;
      })}
    </div>
  </section>;
}

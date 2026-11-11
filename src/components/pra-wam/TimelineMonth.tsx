"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { calendarWeeks, timelineLanes, type TimelineEntry } from "@/lib/pra-wam/timeline";
import css from "./timeline.module.css";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
export const dayName = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const monthLabel = (key: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T12:00:00Z`));
const shiftMonth = (key: string, by: number) => {
  const date = new Date(`${key}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
};

/** What a day cell carries besides its number: its column and whether it is outside the month or today. */
export type DayMarks = { style: { gridColumn: number }; "data-out"?: string; "data-today"?: string };

/**
 * One month of Timeline (9 Nov 2026): Monday first, each forum or event a bar in its own colour
 * across its days, overlapping ones on their own lines, a bar running on into the next week; ‹ ›
 * between months. Shared by Timeline's calendar (days open booking) and the booking form's month
 * picker (days pick the date), which decide what a day is through `day`. `linkBars`: a bar jumps to
 * its card in Timeline's list (`#t-…`); otherwise it is only drawn. `range` widens the months to page
 * through (the booking period), `open` the month shown first.
 *
 * `legend` (11 Nov 2026, Timeline): the bars are colour only, on every screen, and below the month
 * each forum or event shown in it is named once with its colour and dates.
 */
export function TimelineMonth({ entries, today, open, range, linkBars = false, legend = false, day }: {
  entries: TimelineEntry[]; today: string; open?: string; range?: { from: string; to: string }; linkBars?: boolean; legend?: boolean;
  day: (date: string, marks: DayMarks, number: number) => ReactNode;
}) {
  const months = [...entries.map(entry => entry.from.slice(0, 7)), ...entries.map(entry => entry.to.slice(0, 7)), ...(range ? [range.from.slice(0, 7), range.to.slice(0, 7)] : [])];
  const first = months.length ? months.reduce((min, key) => key < min ? key : min) : today.slice(0, 7);
  const last = months.length ? months.reduce((max, key) => key > max ? key : max) : today.slice(0, 7);
  const want = (open ?? today).slice(0, 7);
  const [month, setMonth] = useState(want < first ? first : want > last ? last : want);
  // A day picked elsewhere (the form) brings its month.
  const [seen, setSeen] = useState(open);
  if (open && seen !== open) { setSeen(open); setMonth(open.slice(0, 7) < first ? first : open.slice(0, 7) > last ? last : open.slice(0, 7)); }
  const lanes = useMemo(() => timelineLanes(entries), [entries]);
  const weeks = useMemo(() => calendarWeeks(month, entries, lanes), [month, entries, lanes]);
  const named = legend ? entries.filter(entry => entry.from.slice(0, 7) <= month && entry.to.slice(0, 7) >= month) : [];

  return <section className={`${css.calendar} ${legend ? css.calPlain : ""}`} aria-label={`Kalender ${monthLabel(month)}`}>
    <div className={css.calHead}>
      <h2 className={css.calTitle} aria-live="polite">{monthLabel(month)}</h2>
      <div className={css.calNav}>
        <button type="button" className={css.calArrow} onClick={() => setMonth(shiftMonth(month, -1))} disabled={month <= first} aria-label="Bulan sebelumnya"><ChevronLeft aria-hidden /></button>
        <button type="button" className={css.calArrow} onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= last} aria-label="Bulan berikutnya"><ChevronRight aria-hidden /></button>
      </div>
    </div>
    <div className={css.calWeekdays} aria-hidden>{WEEKDAYS.map(name => <span key={name}>{name}</span>)}</div>
    <div className={css.calWeeks}>
      {weeks.map(week => {
        const rows = week.bars.reduce((max, bar) => Math.max(max, bar.lane + 1), 0);
        return <div key={week.days[0].date} className={css.calWeek} style={{ gridTemplateRows: `auto repeat(${rows}, var(--tl-bar))` }}>
          {week.days.map((item, index) => day(item.date, { style: { gridColumn: index + 1 }, "data-out": item.inMonth ? undefined : "", "data-today": item.date === today ? "" : undefined }, Number(item.date.slice(8))))}
          {week.bars.map(bar => {
            const place = { className: `${css.calBar} ${css[`c${bar.color}`]}`, title: bar.title, style: { gridColumn: `${bar.start + 1} / ${bar.end + 2}`, gridRow: bar.lane + 2 },
              "data-before": bar.before ? "" : undefined, "data-after": bar.after ? "" : undefined };
            return linkBars
              ? <a key={bar.id} href={`#t-${bar.id}`} {...place}><span>{bar.title}</span></a>
              : <span key={bar.id} {...place}><span>{bar.title}</span></span>;
          })}
        </div>;
      })}
    </div>
    {legend && (named.length > 0
      ? <ul className={css.legend} aria-label={`Kegiatan Pra WAM, ${monthLabel(month)}`}>{named.map(entry => <li key={entry.id} className={css[`c${entry.color}`]} data-state={entry.state}>
        <span className={css.legendDot} aria-hidden />
        <span className={css.legendText}><span className={css.legendTitle}>{entry.title}</span><small>{entry.when}{entry.state === "berlangsung" ? " · Sedang berlangsung" : entry.state === "selesai" ? " · Selesai" : ""}</small></span>
      </li>)}</ul>
      : <p className={css.legendNone}>Tidak ada kegiatan Pra WAM di bulan ini.</p>)}
  </section>;
}

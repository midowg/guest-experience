"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { calendarWeeks, timelineLanes, type TimelineEntry } from "@/lib/pra-wam/timeline";
import { praWamPath } from "@/lib/routes";
import css from "./timeline.module.css";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const dayName = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const monthLabel = (key: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T12:00:00Z`));
const shiftMonth = (key: string, by: number) => {
  const date = new Date(`${key}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
};

/**
 * Timeline's calendar (9 Nov 2026): one month, Monday first, each forum or event a bar in its own
 * colour across its days (the colour its card has in the list below), overlapping ones on their
 * own lines and a bar running on into the next week. A bar jumps to its card. On a phone the bars
 * are thin lines; from a tablet up they carry the title. ‹ › between the months that have entries.
 * Every day opens the booking page on it (9 Nov 2026: Book has no calendar any more; weekends too,
 * since "Di luar kantor" can be booked then, so all days behave alike). The booking page says when a
 * day cannot be booked and offers the nearest one. `canBook` false (Book closed): plain days.
 */
export function TimelineCalendar({ entries, today, canBook = false }: { entries: TimelineEntry[]; today: string; canBook?: boolean }) {
  const first = entries[0]?.from.slice(0, 7) ?? today.slice(0, 7);
  const last = entries.reduce((max, entry) => entry.to.slice(0, 7) > max ? entry.to.slice(0, 7) : max, first);
  const start = today.slice(0, 7) < first ? first : today.slice(0, 7) > last ? last : today.slice(0, 7);
  const [month, setMonth] = useState(start);
  const lanes = useMemo(() => timelineLanes(entries), [entries]);
  const weeks = useMemo(() => calendarWeeks(month, entries, lanes), [month, entries, lanes]);

  return <section className={css.calendar} aria-label={`Kalender ${monthLabel(month)}`}>
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
          {week.days.map((day, index) => {
            const marks = { style: { gridColumn: index + 1 }, "data-out": day.inMonth ? undefined : "", "data-today": day.date === today ? "" : undefined };
            return canBook
              ? <a key={day.date} className={`${css.calDay} ${css.calDayLink}`} href={praWamPath.book({ date: day.date })} aria-label={`Book ruang, ${dayName(day.date)}`} {...marks}>
                <span>{Number(day.date.slice(8))}</span>
              </a>
              : <span key={day.date} className={css.calDay} {...marks}><span>{Number(day.date.slice(8))}</span></span>;
          })}
          {week.bars.map(bar => <a key={bar.id} href={`#t-${bar.id}`} className={`${css.calBar} ${css[`c${bar.color}`]}`} title={bar.title}
            style={{ gridColumn: `${bar.start + 1} / ${bar.end + 2}`, gridRow: bar.lane + 2 }} data-before={bar.before ? "" : undefined} data-after={bar.after ? "" : undefined}>
            <span>{bar.title}</span>
          </a>)}
        </div>;
      })}
    </div>
  </section>;
}

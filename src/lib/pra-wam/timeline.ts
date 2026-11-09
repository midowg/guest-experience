import { clockLabel, wibDate, wibTime } from "./appraisal";
import type { SessionKind } from "./sessions";

/*
 * Timeline (9 Nov 2026): Pra WAM's forums and events, as panitia plan them in Kelola acara →
 * Jadwal sesi, for everyone to read, month by month like the "Perjalanan Pra WAM" slide. A
 * published one shows its day and hours; a draft only the dates panitia planned ("jadwal pasti
 * menyusul"), never its description or people. Rapat (room bookings) and cancelled ones stay out.
 */

export type TimelineItem = {
  id: string; title: string; kind: Exclude<SessionKind, "rapat">; published: boolean;
  planFrom: string | null; planTo: string | null; startsAt: string | null; endsAt: string | null;
  /** The person takes part in it (a published one opens its detail). */
  mine: boolean;
};
export type TimelineState = "selesai" | "berlangsung" | "akan";
/** `color`: the entry's own colour (0 to TIMELINE_COLORS - 1), the same in the calendar and the list. */
export type TimelineEntry = TimelineItem & { from: string; to: string; state: TimelineState; when: string; hours: string | null; color: number };
export type TimelineMonth = { key: string; label: string; entries: TimelineEntry[] };

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" });
const at = (date: string) => new Date(`${date}T12:00:00Z`);
const day = fmt({ day: "numeric" });
const dayMonth = fmt({ day: "numeric", month: "short" });
const weekdayDayMonth = fmt({ weekday: "short", day: "numeric", month: "short" });
const monthName = fmt({ month: "long", year: "numeric" });

/** "24–27 Nov", "30 Nov – 4 Des", "Sel, 10 Nov". */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return weekdayDayMonth.format(at(from));
  if (from.slice(0, 7) === to.slice(0, 7)) return `${day.format(at(from))}–${dayMonth.format(at(to))}`;
  return `${dayMonth.format(at(from))} – ${dayMonth.format(at(to))}`;
}

/** The entries that have dates, in order, grouped by the month they start in. */
export function timelineMonths(items: TimelineItem[], today: string): TimelineMonth[] {
  const entries: TimelineEntry[] = [];
  for (const item of items) {
    const exact = item.published && item.startsAt && item.endsAt;
    const from = exact ? wibDate(item.startsAt!) : item.planFrom;
    const to = exact ? wibDate(item.endsAt!) : item.planTo ?? item.planFrom;
    if (!from || !to) continue;
    const state: TimelineState = to < today ? "selesai" : from <= today ? "berlangsung" : "akan";
    entries.push({
      ...item, from, to, state, when: rangeLabel(from, to),
      hours: exact ? `${clockLabel(wibTime(item.startsAt!))}–${clockLabel(wibTime(item.endsAt!))}` : null, color: 0,
    });
  }
  entries.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.title.localeCompare(b.title, "id"));
  entries.forEach((entry, index) => { entry.color = index % TIMELINE_COLORS; });
  const months: TimelineMonth[] = [];
  for (const entry of entries) {
    const key = entry.from.slice(0, 7);
    const month = months.find(item => item.key === key);
    if (month) month.entries.push(entry);
    else months.push({ key, label: monthName.format(at(`${key}-01`)), entries: [entry] });
  }
  return months;
}

/** How many colours the timeline cycles through (timeline.module.css, .c0 to .c8). */
export const TIMELINE_COLORS = 9;

export type CalendarBar = { id: string; title: string; color: number; lane: number; start: number; end: number; before: boolean; after: boolean };
export type CalendarWeek = { days: { date: string; inMonth: boolean }[]; bars: CalendarBar[] };

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** Monday = 0 … Sunday = 6. */
const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Each entry's lane: the first one free since its start, so overlapping entries sit on separate
 * lines and an entry keeps its line in every week it crosses (one unbroken bar).
 */
export function timelineLanes(entries: Pick<TimelineEntry, "id" | "from" | "to">[]): Map<string, number> {
  const lanes = new Map<string, number>();
  const lastDay: string[] = [];
  for (const entry of [...entries].sort((a, b) => a.from.localeCompare(b.from) || b.to.localeCompare(a.to))) {
    let lane = lastDay.findIndex(day => day < entry.from);
    if (lane < 0) lane = lastDay.length;
    lastDay[lane] = entry.to;
    lanes.set(entry.id, lane);
  }
  return lanes;
}

/** The weeks (Monday first) showing month `key` ("2026-11"), each with its days and the bars crossing it. */
export function calendarWeeks(key: string, entries: TimelineEntry[], lanes = timelineLanes(entries)): CalendarWeek[] {
  const first = `${key}-01`;
  const next = key.slice(5) === "12" ? `${Number(key.slice(0, 4)) + 1}-01-01` : `${key.slice(0, 5)}${String(Number(key.slice(5)) + 1).padStart(2, "0")}-01`;
  const weeks: CalendarWeek[] = [];
  for (let monday = addDays(first, -weekday(first)); monday < next; monday = addDays(monday, 7)) {
    const sunday = addDays(monday, 6);
    const days = Array.from({ length: 7 }, (_, index) => { const date = addDays(monday, index); return { date, inMonth: date.slice(0, 7) === key }; });
    const bars = entries.filter(entry => entry.from <= sunday && entry.to >= monday).map(entry => ({
      id: entry.id, title: entry.title, color: entry.color, lane: lanes.get(entry.id) ?? 0,
      start: entry.from < monday ? 0 : weekday(entry.from), end: entry.to > sunday ? 6 : weekday(entry.to),
      before: entry.from < monday, after: entry.to > sunday,
    }));
    weeks.push({ days, bars });
  }
  return weeks;
}

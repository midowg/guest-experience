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
export type TimelineEntry = TimelineItem & { from: string; to: string; state: TimelineState; when: string; hours: string | null };
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
      hours: exact ? `${clockLabel(wibTime(item.startsAt!))}–${clockLabel(wibTime(item.endsAt!))}` : null,
    });
  }
  entries.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.title.localeCompare(b.title, "id"));
  const months: TimelineMonth[] = [];
  for (const entry of entries) {
    const key = entry.from.slice(0, 7);
    const month = months.find(item => item.key === key);
    if (month) month.entries.push(entry);
    else months.push({ key, label: monthName.format(at(`${key}-01`)), entries: [entry] });
  }
  return months;
}

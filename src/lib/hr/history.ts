import type { DailyRecord } from "./attendance";
import { zoneTime, type ViewerZone } from "@/lib/pra-wam/zone";

/*
 * The arithmetic behind WG People's Beranda week and Riwayat (21 Nov 2026): weeks start on Monday,
 * dates are plain "YYYY-MM-DD" work dates (already in the office's zone), times are read in the
 * viewer's zone. Pure, so it is tested without a browser.
 */
const DAY_MS = 86_400_000;
const parse = (date: string) => Date.parse(`${date}T00:00:00Z`);
const format = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const shiftDate = (date: string, days: number) => format(parse(date) + days * DAY_MS);
/** Monday of the week the date is in. */
export const weekStart = (date: string) => shiftDate(date, -((new Date(parse(date)).getUTCDay() + 6) % 7));
/** The seven dates of the week the date is in, Monday first. */
export const weekOf = (date: string) => Array.from({ length: 7 }, (_, index) => shiftDate(weekStart(date), index));

const short = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
/** "Minggu ini", "Minggu lalu", or the week's span: "3–9 Nov", "27 Okt – 2 Nov". */
export function weekLabel(date: string, today: string): string {
  const start = weekStart(date), thisWeek = weekStart(today);
  if (start === thisWeek) return "Minggu ini";
  if (start === shiftDate(thisWeek, -7)) return "Minggu lalu";
  const end = shiftDate(start, 6);
  return start.slice(5, 7) === end.slice(5, 7)
    ? `${Number(start.slice(8))}–${short(end, { day: "numeric", month: "short" })}`
    : `${short(start, { day: "numeric", month: "short" })} – ${short(end, { day: "numeric", month: "short" })}`;
}

/** Work dates that have a record, newest first, in groups by week. */
export function byWeek(dates: string[], today: string): { label: string; dates: string[] }[] {
  const groups: { label: string; dates: string[] }[] = [];
  for (const date of [...new Set(dates)].sort().reverse()) {
    const label = weekLabel(date, today);
    const last = groups.at(-1);
    if (last?.label === label) last.dates.push(date); else groups.push({ label, dates: [date] });
  }
  return groups;
}

const minutesOf = (iso: string, zone: ViewerZone) => { const [hours, minutes] = zoneTime(iso, zone).split(":").map(Number); return hours * 60 + minutes; };
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}.${String(minutes % 60).padStart(2, "0")}`;
/** "8 j 39 m", "45 m". */
export const durationLabel = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)} j ${minutes % 60} m` : `${Math.max(0, minutes)} m`);
/** Minutes between masuk and pulang (or now, while still at work). */
export const workedMinutes = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));

/** Riwayat's three numbers: days with a masuk, records still to be checked, the usual masuk time. */
export function historySummary(records: DailyRecord[], zone: ViewerZone): { days: number; toCheck: number; usualIn: string | null } {
  const masuk = records.filter(record => record.kind === "masuk");
  const average = masuk.length ? Math.round(masuk.reduce((sum, record) => sum + minutesOf(record.at, zone), 0) / masuk.length) : null;
  return {
    days: new Set(masuk.map(record => record.workDate)).size,
    toCheck: records.filter(record => record.status === "perlu_cek").length,
    usualIn: average === null ? null : clock(average),
  };
}

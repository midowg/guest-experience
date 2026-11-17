import { wibDate, wibTime } from "../rundown";

/*
 * Words and numbers of the panitia and BOD screens (K01–K08, B01–B02): clock times "10.20", a
 * change mark "diubah Dimas · 08.05", a shift "+30 menit", tonnes "13,6". Pure.
 */

const number = new Intl.NumberFormat("id-ID");
/** "1.240". */
export const count = (value: number) => number.format(value);

/** "10.20" (WIB). */
export const clock = (iso: string) => wibTime(iso).replace(":", ".");

const dayFormat = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
/** "Sen, 4 Jan" for a WIB date "2027-01-04". */
export const shortDate = (date: string) => dayFormat.format(new Date(`${date}T12:00:00Z`)).replace(/\./g, "");

/** "09.40" today, "Sen, 4 Jan · 20.15" another day. */
export function dayClock(iso: string, now: Date): string {
  const date = wibDate(iso);
  return date === wibDate(now.toISOString()) ? clock(iso) : `${shortDate(date)} · ${clock(iso)}`;
}

/** "diubah Dimas · 08.05"; another day: "diubah Dimas · Sen, 4 Jan · 08.05". */
export const editedLabel = (name: string, iso: string, now: Date) => `diubah ${name} · ${dayClock(iso, now)}`;

/**
 * A clock time typed on a phone, as minutes after midnight: "8.00", "08.00", "08:00", "0800",
 * "830", "8" and "8,30" all work (a decimal keypad has "," or "."). Null when it is not a time.
 */
export function parseClock(text: string): number | null {
  const value = text.trim().replace(",", ".").replace(":", ".");
  let hours: number, minutes: number;
  const parts = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(value);
  if (parts) {
    hours = Number(parts[1]);
    minutes = parts[2] === undefined ? 0 : Number(parts[2].padEnd(2, "0"));
  } else if (/^\d{3,4}$/.test(value)) {
    hours = Number(value.slice(0, -2));
    minutes = Number(value.slice(-2));
  } else return null;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 510 → "08.30". */
export const formatMinutes = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}.${String(minutes % 60).padStart(2, "0")}`;
/** The WIB clock of an instant as minutes after midnight. */
export const clockMinutes = (iso: string) => { const [hours, minutes] = wibTime(iso).split(":").map(Number); return hours * 60 + minutes; };

/** "+30 menit", "−15 menit", "+60 menit" (minutes, as the prototype writes a shift). */
export function signedDuration(ms: number): string {
  const total = Math.round(Math.abs(ms) / 60_000);
  return `${ms < 0 ? "−" : "+"}${count(total)} menit`;
}

/** A whole percentage (0 when there is nobody to count). */
export const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Tonnes with one decimal, Indonesian style: 13.6 → "13,6". */
export const tonnes = (value: number) => value.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Jejak karbon for a person to read: tonnes with one decimal from 0,1 t ("13,6 t CO₂e"), kilograms
 * below it ("45 kg CO₂e"), so a small total never reads "0,0 t" (audit R16).
 */
export function carbonAmount(kg: number): { value: string; unit: string } {
  const wholeKg = Math.round(kg);
  if (wholeKg >= 100) return { value: tonnes(Math.round(kg / 100) / 10), unit: "t CO₂e" };
  return { value: wholeKg < 1 ? "<1" : count(wholeKg), unit: "kg CO₂e" };
}

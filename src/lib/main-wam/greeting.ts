import { wibDate } from "@/lib/pra-wam/appraisal";
import { eventDayLabel } from "./rundown";
import type { MainWamEventInfo } from "./types";

/*
 * Beranda's head (P01): "Selamat pagi · Sel, 5 Jan", the nama panggilan, and "Hari ke-2 dari 4"
 * during the event. WIB. Pure.
 */

const hourWib = (now: Date) => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(now));

/** Pagi until 11, siang until 15, sore until 18, then malam (as Pra WAM's Beranda). */
export function salam(now: Date): string {
  const hour = hourWib(now);
  return hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
}

/** "Sel, 5 Jan". */
export const shortDay = (now: Date) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(now).replace(/\./g, "");

/** What the shell's greeting takes (ShellGreeting of the UI kit). */
export function homeGreeting(now: Date, name: string, event: Pick<MainWamEventInfo, "startDate" | "endDate">): { kicker: string; name: string; day?: string } {
  const day = eventDayLabel(wibDate(now.toISOString()), event);
  return { kicker: `${salam(now)} · ${shortDay(now)}`, name, ...(day ? { day } : {}) };
}

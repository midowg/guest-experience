import { wibDate } from "@/lib/pra-wam/appraisal";
import { eventDay, eventDayLabel } from "./rundown";
import type { MainWamEventInfo, MainWamRole } from "./types";

/*
 * Beranda's head (P01): "Selamat pagi", the nama panggilan, and "Hari ke-2 dari 4" during the event.
 * Outside the event days there is no day line, so the kicker carries the date: "Selamat pagi · Sel, 5 Jan". WIB. Pure.
 */

const hourWib = (now: Date) => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(now));

/** Pagi until 11, siang until 15, sore until 18, then malam (as Pra WAM's Beranda). */
export function salam(now: Date): string {
  const hour = hourWib(now);
  return hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
}

/** "Sel, 5 Jan". */
export const shortDay = (now: Date) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" }).format(now).replace(/\./g, "");

/**
 * What the shell's greeting takes (ShellGreeting of the UI kit). `role` (mainWamRole): panitia read
 * their role on the day line, "Hari ke-2 dari 4 · Panitia" (K01); BOD and peserta nothing.
 */
export function homeGreeting(now: Date, name: string, event: Pick<MainWamEventInfo, "startDate" | "endDate">, role?: MainWamRole): { kicker: string; name: string; day?: string } {
  const date = wibDate(now.toISOString());
  const label = eventDayLabel(date, event);
  if (!label) return { kicker: `${salam(now)} · ${shortDay(now)}`, name };
  // WAM: the first day is the trip there, the last the trip home (P02: "Hari ke-1 dari 4 · Berangkat").
  const found = eventDay(date, event);
  const trip = found && found.of > 1 ? (found.day === 1 ? " · Berangkat" : found.day === found.of ? " · Pulang" : "") : "";
  return { kicker: salam(now), name, day: label + trip + (role === "panitia" ? " · Panitia" : "") };
}

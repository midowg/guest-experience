import { wibDate } from "@/lib/pra-wam/appraisal";
import { shortDateOfInstant, t, type Lang } from "./i18n";
import { eventDay, eventDayLabel } from "./rundown";
import type { MainWamEventInfo, MainWamRole } from "./types";

/*
 * Beranda's head (P01): "Selamat pagi", the nama panggilan, and "Hari ke-2 dari 4" during the event.
 * Outside the event days there is no day line, so the kicker carries the date: "Selamat pagi · Sel, 5 Jan". WIB. Pure.
 */

const hourWib = (now: Date) => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Jakarta" }).format(now));

/** Pagi until 11, siang until 15, sore until 18, then malam (as Pra WAM's Beranda). */
export function salam(now: Date, lang: Lang = "id"): string {
  const hour = hourWib(now);
  return t(lang, hour < 11 ? "hello.morning" : hour < 15 ? "hello.noon" : hour < 18 ? "hello.afternoon" : "hello.night");
}

/** "Sel, 5 Jan". */
export const shortDay = (now: Date, lang: Lang = "id") => shortDateOfInstant(lang, now);

/**
 * What the shell's greeting takes (ShellGreeting of the UI kit). `role` (mainWamRole): panitia read
 * their role on the day line, "Hari ke-2 dari 4 · Panitia" (K01); BOD and peserta nothing.
 */
export function homeGreeting(now: Date, name: string, event: Pick<MainWamEventInfo, "startDate" | "endDate">, role?: MainWamRole, lang: Lang = "id"): { kicker: string; name: string; day?: string } {
  const date = wibDate(now.toISOString());
  const label = eventDayLabel(date, event, lang);
  if (!label) return { kicker: `${salam(now, lang)} · ${shortDay(now, lang)}`, name };
  // WAM: the first day is the trip there, the last the trip home (P02: "Hari ke-1 dari 4 · Berangkat").
  const found = eventDay(date, event);
  const trip = found && found.of > 1 ? (found.day === 1 ? t(lang, "fmt.tripOut") : found.day === found.of ? t(lang, "fmt.tripBack") : "") : "";
  return { kicker: salam(now, lang), name, day: label + trip + (role === "panitia" ? t(lang, "fmt.roleCommittee") : "") };
}

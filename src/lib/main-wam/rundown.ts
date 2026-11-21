import { wibDate, wibInstant, wibTime } from "@/lib/pra-wam/appraisal";
import { clock, shortDate, t, type Lang } from "./i18n";
import type { MainWamEventInfo, MwSession } from "./types";

/*
 * The rundown's rules every screen shares (docs/main-wam/KONTRAK.md §4): which day of the event it
 * is, what runs now and what comes next, the session the Sekarang card shows, and the session a new
 * photo is tagged with. Times are WIB. Pure: tested without a server.
 */

export { wibDate, wibInstant, wibTime };

/** A moment without an end ("14.30 Shuttle ke hotel") counts as 30 minutes. */
export const POINT_MINUTES = 30;
/** Absen opens 30 minutes before the start and closes 30 minutes after the end (aturan-wam §7). */
export const CHECK_IN_MARGIN_MINUTES = 30;

type Timed = Pick<MwSession, "startsAt" | "endsAt">;
const ms = (iso: string) => Date.parse(iso);

/** The end of a session, its own or 30 minutes after a start without one. */
export const sessionEnd = (session: Timed): string => session.endsAt ?? new Date(ms(session.startsAt) + POINT_MINUTES * 60_000).toISOString();
export const isRunning = (session: Timed, now: Date) => ms(session.startsAt) <= now.getTime() && now.getTime() < ms(sessionEnd(session));
export const hasEnded = (session: Timed, now: Date) => ms(sessionEnd(session)) <= now.getTime();

/** Shown to participants: published only (drafts are the admin's, cancelled ones are struck through by the screen itself). */
export const isLive = (session: Pick<MwSession, "status">) => session.status === "terbit";

/** By start, then the admin's order, then title, so equal starts never jump around. */
export function byStart<T extends Pick<MwSession, "startsAt" | "sort" | "title">>(a: T, b: T): number {
  return ms(a.startsAt) - ms(b.startsAt) || a.sort - b.sort || a.title.localeCompare(b.title, "id");
}

/* ── Days ─────────────────────────────────────────────────────────────────────────────────────── */

export const addDays = (date: string, days: number) => {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};

/** Every day of the event, first to last ("2027-01-04" … "2027-01-07"). */
export function eventDates(event: Pick<MainWamEventInfo, "startDate" | "endDate">): string[] {
  const dates: string[] = [];
  for (let date = event.startDate; date <= event.endDate && dates.length < 31; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/* ── Persiapan (H-n) ──────────────────────────────────────────────────────────────────────────── */

/** How many days before the first day an agenda ("H-3", Persiapan) may be dated. */
export const PREP_WINDOW_DAYS = 60;

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** How many days before the event's first day a date is (3 for "H-3"); null on or after the first day, or earlier than the window. */
export function daysBeforeEvent(date: string, event: Pick<MainWamEventInfo, "startDate">): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const days = daysBetween(date, event.startDate);
  return days >= 1 && days <= PREP_WINDOW_DAYS ? days : null;
}

/** A date before the first day and inside the window: an agenda of the "H-n" kind (Persiapan). */
export const isPrepDate = (date: string, event: Pick<MainWamEventInfo, "startDate">) => daysBeforeEvent(date, event) !== null;

/** A date a session may be given: a day of the event, or a Persiapan day before it. */
export const isSessionDate = (date: string, event: Pick<MainWamEventInfo, "startDate" | "endDate">) => eventDates(event).includes(date) || isPrepDate(date, event);

/** The earliest and latest date a Persiapan agenda may have ("2026-11-05" … "2027-01-03"). */
export function prepRange(event: Pick<MainWamEventInfo, "startDate">): { from: string; to: string } {
  return { from: addDays(event.startDate, -PREP_WINDOW_DAYS), to: addDays(event.startDate, -1) };
}

/** "H-3". */
export const prepLabel = (days: number) => `H-${days}`;

/** The Persiapan dates the sessions occupy, earliest first. */
export function prepDatesOf(sessions: readonly Pick<MwSession, "startsAt">[], event: Pick<MainWamEventInfo, "startDate">): string[] {
  return [...new Set(sessions.map(session => wibDate(session.startsAt)).filter(date => isPrepDate(date, event)))].sort();
}

/** "Hari ke-2 dari 4": the day number of a date (1-based) and the total; null outside the event. */
export function eventDay(date: string, event: Pick<MainWamEventInfo, "startDate" | "endDate">): { day: number; of: number } | null {
  const dates = eventDates(event);
  const index = dates.indexOf(date);
  return index < 0 ? null : { day: index + 1, of: dates.length };
}

/** "Hari ke-2 dari 4", or "" outside the event. */
export function eventDayLabel(date: string, event: Pick<MainWamEventInfo, "startDate" | "endDate">, lang: Lang = "id"): string {
  const found = eventDay(date, event);
  return found ? t(lang, "fmt.dayOf", { day: found.day, of: found.of }) : "";
}

/**
 * The day Agenda opens on: the asked one (1–N) when valid, else today during the event, else the
 * first day (before) or the last (after).
 */
export function agendaDay(asked: string | number | null | undefined, today: string, event: Pick<MainWamEventInfo, "startDate" | "endDate">): number {
  const dates = eventDates(event);
  const number = Number(asked);
  if (Number.isInteger(number) && number >= 1 && number <= dates.length) return number;
  const index = dates.indexOf(today);
  if (index >= 0) return index + 1;
  return today < event.startDate ? 1 : dates.length;
}

/** The sessions of one event day (1-based), in order; a session belongs to the WIB day it starts. */
export function sessionsOfDay<T extends MwSession>(sessions: readonly T[], day: number, event: Pick<MainWamEventInfo, "startDate" | "endDate">): T[] {
  const date = eventDates(event)[day - 1];
  return date ? sessions.filter(session => wibDate(session.startsAt) === date).sort(byStart) : [];
}

/* ── Now and next ─────────────────────────────────────────────────────────────────────────────── */

/** The sessions running now and the first one still to come (published only). */
export function nowAndNext<T extends MwSession>(sessions: readonly T[], now: Date): { running: T[]; next: T | null } {
  const live = sessions.filter(isLive).sort(byStart);
  return { running: live.filter(session => isRunning(session, now)), next: live.find(session => ms(session.startsAt) > now.getTime()) ?? null };
}

/** Absen's window for a session: from 30 minutes before its start to 30 minutes after its end. */
export function checkInWindow(session: Timed): { opens: string; closes: string } {
  return {
    opens: new Date(ms(session.startsAt) - CHECK_IN_MARGIN_MINUTES * 60_000).toISOString(),
    closes: new Date(ms(sessionEnd(session)) + CHECK_IN_MARGIN_MINUTES * 60_000).toISOString(),
  };
}
export function checkInState(session: Timed, now: Date): "belum" | "buka" | "tutup" {
  const { opens, closes } = checkInWindow(session);
  return now.getTime() < ms(opens) ? "belum" : now.getTime() <= ms(closes) ? "buka" : "tutup";
}

/** What the Sekarang card on Beranda shows. */
export type NowCard<T extends MwSession = MwSession> =
  | { kind: "absen"; session: T }
  | { kind: "berlangsung"; session: T }
  | { kind: "berikutnya"; session: T }
  /** Today is done; `tomorrow` is the first session of the next day with one (null after the last). */
  | { kind: "selesai"; tomorrow: T | null }
  | { kind: "kosong" };

/**
 * The Sekarang card (P01): (1) a session whose absen is open and the person has not checked in,
 * (2) a running session, (3) the next one today, else "selesai" with tomorrow's first. A meal is
 * never picked while a real session (sesi, perjalanan) qualifies. `absenOn`: module Absen QR is on
 * and the person checks in (not BOD).
 */
export function nowCard<T extends MwSession>(sessions: readonly T[], now: Date, opts: { absenOn: boolean; checkedIn: ReadonlySet<string> }): NowCard<T> {
  const live = sessions.filter(isLive).sort(byStart);
  if (!live.length) return { kind: "kosong" };
  const preferReal = (list: T[]) => list.find(session => session.kind !== "makan") ?? list[0];
  if (opts.absenOn) {
    const open = live.filter(session => session.usesAttendance && !opts.checkedIn.has(session.id) && checkInState(session, now) === "buka");
    if (open.length) return { kind: "absen", session: preferReal(open) };
  }
  const running = live.filter(session => isRunning(session, now));
  if (running.length) return { kind: "berlangsung", session: preferReal(running) };
  const today = wibDate(now.toISOString());
  const laterToday = live.filter(session => ms(session.startsAt) > now.getTime() && wibDate(session.startsAt) === today);
  if (laterToday.length) {
    // The first start; among sessions starting together, a real one over a meal.
    const first = laterToday.filter(session => session.startsAt === laterToday[0].startsAt);
    return { kind: "berikutnya", session: preferReal(first) };
  }
  const later = live.find(session => wibDate(session.startsAt) > today) ?? null;
  const anyToday = live.some(session => wibDate(session.startsAt) === today);
  // A day without sessions (before the event, a free day): the next one, whenever it is.
  if (!anyToday && later) return { kind: "berikutnya", session: later };
  return { kind: "selesai", tomorrow: later };
}

/* ── Photo tags ───────────────────────────────────────────────────────────────────────────────── */

/**
 * The session a photo taken now is tagged with (U01 "Sesi: Team building"): a running session,
 * a real one before a meal, the latest started first. Null = "Umum".
 */
export function autoTag<T extends MwSession>(sessions: readonly T[], now: Date): T | null {
  const running = sessions.filter(isLive).filter(session => isRunning(session, now));
  if (!running.length) return null;
  const rank = (session: T) => (session.kind === "makan" ? 1 : 0);
  return [...running].sort((a, b) => rank(a) - rank(b) || ms(b.startsAt) - ms(a.startsAt))[0];
}

/**
 * The "Tag sesi" sheet: the sessions already started, by day, newest day first ("Hari ini",
 * "Kemarin", then dates), each day in order. The Umum choice is the screen's own first row.
 */
export function tagChoices<T extends MwSession>(sessions: readonly T[], now: Date): { date: string; sessions: T[] }[] {
  const started = sessions.filter(isLive).filter(session => ms(session.startsAt) <= now.getTime()).sort(byStart);
  const days = [...new Set(started.map(session => wibDate(session.startsAt)))].sort().reverse();
  return days.map(date => ({ date, sessions: started.filter(session => wibDate(session.startsAt) === date) }));
}

/** "Hari ini", "Kemarin", "Besok" or "Sen, 4 Jan". */
export function dayWord(date: string, today: string, lang: Lang = "id"): string {
  if (date === today) return t(lang, "fmt.today");
  if (date === addDays(today, -1)) return t(lang, "fmt.yesterday");
  if (date === addDays(today, 1)) return t(lang, "fmt.tomorrow");
  return lang === "id" ? new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : shortDate(lang, date);
}

/** "08.00–12.00", or "14.30" for a moment without an end. */
export function timeRange(session: Timed, lang: Lang = "id"): string {
  const start = clock(lang, wibTime(session.startsAt));
  return session.endsAt ? `${start}–${clock(lang, wibTime(session.endsAt))}` : start;
}

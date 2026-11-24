import { shortDate, t, type Lang } from "../i18n";
import { byStart, dayWord, isLive, isRunning, tagChoices, timeRange, wibDate } from "../rundown";
import type { MwSession } from "../types";
import type { SessionCount } from "./types";

/*
 * The session sheets of Momen: "Saring sesi" (M01: sessions that have photos, by day, newest
 * first, then Umum) and "Tag sesi" (U01: sessions already started, Umum first). Pure.
 */

/** A session as a sheet row needs it (sent to the browser: no more than this). */
export type SessionChoice = { id: string; title: string; date: string; startsAt: string; time: string; running: boolean };
export type SessionGroup = { head: string; rows: (SessionChoice & { photos?: number })[] };

export function sessionChoice(session: MwSession, now: Date, lang: Lang = "id"): SessionChoice {
  return { id: session.id, title: session.title, date: wibDate(session.startsAt), startsAt: session.startsAt, time: timeRange(session, lang), running: isRunning(session, now) };
}

/** "Hari ini · Sel, 5 Jan", "Kemarin · Sen, 4 Jan", "Rab, 6 Jan". */
export function dayHead(date: string, today: string, lang: Lang = "id"): string {
  const label = shortDate(lang, date);
  const word = dayWord(date, today, lang);
  return word === t(lang, "fmt.today") || word === t(lang, "fmt.yesterday") || word === t(lang, "fmt.tomorrow") ? `${word} · ${label}` : label;
}

/** A row's second line: "08.00–12.00 · sedang berlangsung". */
export const choiceSub = (choice: Pick<SessionChoice, "time" | "running">, lang: Lang = "id") => (choice.running ? t(lang, "momen.running", { time: choice.time }) : choice.time);

function byDay<T extends { date: string; startsAt: string }>(rows: T[], today: string, lang: Lang): { head: string; rows: T[] }[] {
  const days = [...new Set(rows.map(row => row.date))].sort().reverse();
  return days.map(date => ({ head: dayHead(date, today, lang), rows: rows.filter(row => row.date === date).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)) }));
}

/** "Saring sesi": the published sessions that have photos in the view, by day (newest first). */
export function filterGroups(sessions: readonly SessionChoice[], counts: readonly SessionCount[], now: Date, lang: Lang = "id"): SessionGroup[] {
  const photos = new Map(counts.filter(count => count.sessionId).map(count => [count.sessionId as string, count.photos]));
  const rows = sessions.filter(session => (photos.get(session.id) ?? 0) > 0).map(session => ({ ...session, photos: photos.get(session.id) }));
  return byDay(rows, wibDate(now.toISOString()), lang);
}

/** "Tag sesi": the sessions already started (U01), by day, the latest first. */
export function tagGroups(sessions: readonly MwSession[], now: Date, lang: Lang = "id"): SessionGroup[] {
  const today = wibDate(now.toISOString());
  return tagChoices(sessions.filter(isLive), now).map(day => ({
    head: dayHead(day.date, today, lang),
    rows: [...day.sessions].sort(byStart).reverse().map(session => sessionChoice(session, now, lang)),
  }));
}

/** All photos of a view (the "Semua sesi" row) and those without a session (Umum). */
export function countTotals(counts: readonly SessionCount[]): { all: number; umum: number } {
  return { all: counts.reduce((sum, count) => sum + count.photos, 0), umum: counts.find(count => count.sessionId === null)?.photos ?? 0 };
}

import { agendaDay, eventDates, hasEnded, isRunning, sessionsOfDay, timeRange, wibDate } from "../rundown";
import type { MainWamEventInfo, MwSession, RundownChange } from "../types";
import { dateLabel, hhmm } from "./format";
import { placeLine } from "./home";

/*
 * Agenda (P03) and the changes a session went through (P03 "Jam berubah", P04 "Selesai 12.30,
 * tadinya 12.00"), from the rundown and Rundown live's log. Participants see published and
 * cancelled sessions (cancelled struck through), never drafts. Pure.
 */

export type AgendaDayTab = { key: string; day: string; date: string; today: boolean; number: number };

/** The four day tabs: "Hari 2" · "Sel, 5 Jan", today marked. */
export function agendaDays(event: Pick<MainWamEventInfo, "startDate" | "endDate">, today: string): AgendaDayTab[] {
  return eventDates(event).map((date, index) => ({ key: String(index + 1), number: index + 1, day: `Hari ${index + 1}`, date: dateLabel(date), today: date === today }));
}

/** The day Agenda shows: the asked one (?hari=), else today during the event (fondasi's agendaDay). */
export const shownDay = (asked: string | string[] | undefined, now: Date, event: Pick<MainWamEventInfo, "startDate" | "endDate">) =>
  agendaDay(Array.isArray(asked) ? asked[0] : asked, wibDate(now.toISOString()), event);

/* ── Changes ──────────────────────────────────────────────────────────────────────────────────── */

export type TimeChange = {
  /** Before the first change: start and end. */
  from: { start: string; end: string | null };
  /** "Selesai 12.30, tadinya 12.00" · "Mulai 13.30, tadinya 13.00" · "Jadi 13.30–15.00, tadinya 13.00–14.30". */
  text: string;
};

/**
 * The time change of a session, comparing its hours now with before its first logged change. Null
 * when it never moved, or moved back.
 */
export function timeChange(session: Pick<MwSession, "id" | "startsAt" | "endsAt">, log: readonly RundownChange[]): TimeChange | null {
  const entries = log.filter(entry => entry.sessionId === session.id).sort((a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt));
  let start: string | null | undefined, end: string | null | undefined;
  for (const entry of entries) for (const change of entry.changes) {
    if (change.field === "startsAt" && start === undefined) start = change.from;
    if (change.field === "endsAt" && end === undefined) end = change.from;
  }
  const same = (a: string | null | undefined, b: string | null) => (a ?? null) === b || (!!a && !!b && Date.parse(a) === Date.parse(b));
  const startMoved = start !== undefined && start !== null && !same(start, session.startsAt);
  const endMoved = end !== undefined && !same(end, session.endsAt);
  if (!startMoved && !endMoved) return null;
  const from = { start: startMoved ? start! : session.startsAt, end: endMoved ? end ?? null : session.endsAt };
  let text: string;
  if (startMoved && endMoved) text = `Jadi ${timeRange(session)}, tadinya ${timeRange({ startsAt: from.start, endsAt: from.end })}`;
  else if (startMoved) text = `Mulai ${hhmm(session.startsAt)}, tadinya ${hhmm(from.start)}`;
  else text = session.endsAt && from.end ? `Selesai ${hhmm(session.endsAt)}, tadinya ${hhmm(from.end)}` : `Jadi ${timeRange(session)}, tadinya ${timeRange({ startsAt: from.start, endsAt: from.end })}`;
  return { from, text };
}

/* ── Rows ─────────────────────────────────────────────────────────────────────────────────────── */

export type AgendaRow = {
  id: string;
  start: string;
  /** Empty for a moment without an end ("14.30 Shuttle"). */
  end: string;
  title: string;
  place: string;
  status: "upcoming" | "live" | "done" | "cancelled";
  /** "Jam berubah" (a pill). */
  changed: boolean;
};

/** One day of the agenda, in order: the running one lit, past ones dimmed, cancelled struck through. */
export function agendaRows(sessions: readonly MwSession[], day: number, event: Pick<MainWamEventInfo, "startDate" | "endDate">, now: Date, log: readonly RundownChange[]): AgendaRow[] {
  const shown = sessions.filter(session => session.status !== "draf");
  return sessionsOfDay(shown, day, event).map(session => ({
    id: session.id,
    start: hhmm(session.startsAt),
    end: session.endsAt ? hhmm(session.endsAt) : "",
    title: session.title,
    place: placeLine(session),
    status: session.status === "batal" ? "cancelled" : isRunning(session, now) ? "live" : hasEnded(session, now) ? "done" : "upcoming",
    changed: session.status !== "batal" && movedInRundown(session, log),
  }));
}

/**
 * Whether Rundown live moved the session: its log says the hours changed, or (the log not readable,
 * or older than the log) the session carries a change mark without any log entry.
 */
export function movedInRundown(session: Pick<MwSession, "id" | "startsAt" | "endsAt" | "changedAt">, log: readonly RundownChange[]): boolean {
  if (timeChange(session, log)) return true;
  return !!session.changedAt && !log.some(entry => entry.sessionId === session.id);
}

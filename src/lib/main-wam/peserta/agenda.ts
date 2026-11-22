import { checklistProgress, ceklisBlock, type ChecklistProgress, type SessionChecklist } from "../ceklis/ceklis";
import { addDays, agendaDay, byStart, daysBeforeEvent, eventDates, hasEnded, isRunning, prepLabel, timeRange, wibDate } from "../rundown";
import type { MainWamEventInfo, MwSession, RundownChange } from "../types";
import { t, type Lang } from "../i18n";
import { dateLabel, hhmm } from "./format";
import { placeLine } from "./home";

/*
 * Agenda (P03) and the changes a session went through (P03 "Jam berubah", P04 "Selesai 12.30,
 * tadinya 12.00"), from the rundown and Rundown live's log. Participants see published and
 * cancelled sessions (cancelled struck through), never drafts. Pure.
 */

/** `prep`: a Persiapan tab before the first day ("H-3", key "h3", number 0; module Ceklis). */
export type AgendaDayTab = { key: string; day: string; date: string; today: boolean; number: number; prep?: boolean };

/**
 * The day tabs: "Hari 2" · "Sel, 5 Jan", today marked. `prepDates` (the dates before the first day that
 * have published agendas, module Ceklis) come first as "H-3" · "Sab, 1 Jan".
 */
export function agendaDays(event: Pick<MainWamEventInfo, "startDate" | "endDate">, today: string, lang: Lang = "id", prepDates: readonly string[] = []): AgendaDayTab[] {
  const prep = prepDates.flatMap((date): AgendaDayTab[] => {
    const days = daysBeforeEvent(date, event);
    return days ? [{ key: `h${days}`, number: 0, prep: true, day: prepLabel(days), date: dateLabel(date, lang), today: date === today }] : [];
  }).sort((a, b) => Number(b.key.slice(1)) - Number(a.key.slice(1)));
  return [...prep, ...eventDates(event).map((date, index) => ({ key: String(index + 1), number: index + 1, day: t(lang, "fmt.dayN", { n: index + 1 }), date: dateLabel(date, lang), today: date === today }))];
}

/** The date a tab key stands for: "2" is the event's second day, "h3" three days before the first. Null when there is no such tab. */
export function tabDate(tab: string, event: Pick<MainWamEventInfo, "startDate" | "endDate">): string | null {
  const prep = /^h(\d{1,2})$/.exec(tab);
  if (prep) return daysBeforeEvent(addDays(event.startDate, -Number(prep[1])), event) ? addDays(event.startDate, -Number(prep[1])) : null;
  return eventDates(event)[Number(tab) - 1] ?? null;
}

/** The tab key an address or a session's date belongs to ("2", or "h3" for a Persiapan date); undefined for a date outside both. */
export function tabOfDate(date: string, event: Pick<MainWamEventInfo, "startDate" | "endDate">): string | undefined {
  const index = eventDates(event).indexOf(date);
  if (index >= 0) return String(index + 1);
  const days = daysBeforeEvent(date, event);
  return days ? `h${days}` : undefined;
}

/**
 * The tab Agenda opens on: the asked one ("3", or "h3") when it exists, else today's during the event,
 * else (before it) today's Persiapan day or the latest one passed, else the first day; after the event the last.
 */
export function shownTab(asked: string | string[] | undefined, now: Date, event: Pick<MainWamEventInfo, "startDate" | "endDate">, prepDates: readonly string[] = []): string {
  const want = Array.isArray(asked) ? asked[0] : asked;
  const prepKeys = new Set(prepDates.map(date => tabOfDate(date, event)).filter((key): key is string => !!key));
  if (want && prepKeys.has(want)) return want;
  if (want && /^\d{1,2}$/.test(want) && Number(want) >= 1 && Number(want) <= eventDates(event).length) return want;
  const today = wibDate(now.toISOString());
  if (prepDates.length && today < event.startDate) {
    const reached = [...prepDates].sort().filter(date => date <= today).at(-1) ?? [...prepDates].sort()[0];
    const key = tabOfDate(reached, event);
    if (key) return key;
  }
  return String(shownDay(undefined, now, event));
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
export function timeChange(session: Pick<MwSession, "id" | "startsAt" | "endsAt">, log: readonly RundownChange[], lang: Lang = "id"): TimeChange | null {
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
  const both = () => t(lang, "peserta.change.both", { range: timeRange(session, lang), from: timeRange({ startsAt: from.start, endsAt: from.end }, lang) });
  if (startMoved && endMoved) text = both();
  else if (startMoved) text = t(lang, "peserta.change.start", { to: hhmm(session.startsAt, lang), from: hhmm(from.start, lang) });
  else text = session.endsAt && from.end ? t(lang, "peserta.change.end", { to: hhmm(session.endsAt, lang), from: hhmm(from.end, lang) }) : both();
  return { from, text };
}

/* ── Rows ─────────────────────────────────────────────────────────────────────────────────────── */

export type AgendaRow = {
  /** Module Ceklis: this agenda has a checklist ("Ceklis 2/5"). */
  ceklis?: ChecklistProgress | null;
  /** Module Ceklis: absen here waits for another agenda's checklist ("Ceklis dulu"). */
  ceklisFirst?: boolean;
  id: string;
  start: string;
  /** Empty for a moment without an end ("14.30 Shuttle"). */
  end: string;
  title: string;
  place: string;
  status: "upcoming" | "live" | "done" | "cancelled";
  /** "Jam berubah" (a pill). */
  changed: boolean;
  /** What the entry is: its icon on the timeline; a meal or a break is drawn as a light row. */
  kind: AgendaKind;
  /** The first session still to come, on the day that is today (the "Berikutnya" mark). */
  next: boolean;
  /** Module Absen: this entry has absen ("Wajib absen" when also required). */
  absen?: "wajib" | "ada";
  /** Module Kuis live: a quiz is tied to this entry ("Kuis live" tag). */
  kuis?: boolean;
  /** Module Misi: points of the missions tied to this entry ("Misi +50" tag); absent when none. */
  misi?: number;
};

/** What the other modules tie to agenda items: sessions that have a quiz, and the points of the missions tied to each session. */
export type AgendaLinks = { quizSessions?: ReadonlySet<string>; missionPoints?: ReadonlyMap<string, number> };

export type AgendaKind = "sesi" | "makan" | "perjalanan" | "jeda";

const BREAK = /(rehat|istirahat|jeda|break|coffee|tenongan)/i;

/** A rest ("Rehat", "Coffee break") is a break whatever its kind; otherwise the session's own kind. */
export const agendaKind = (session: Pick<MwSession, "kind" | "title">): AgendaKind =>
  session.kind === "makan" ? "makan" : session.kind === "perjalanan" ? "perjalanan" : BREAK.test(session.title) ? "jeda" : "sesi";

/** The checklists and what this person ticked (module Ceklis): rows then carry their chips. */
export type AgendaCeklis = { lists: ReadonlyMap<string, SessionChecklist>; checked: ReadonlySet<string> };

/** One day of the agenda, in order: the running one lit, past ones dimmed, cancelled struck through. */
export function agendaRows(sessions: readonly MwSession[], day: number, event: Pick<MainWamEventInfo, "startDate" | "endDate">, now: Date, log: readonly RundownChange[], lang: Lang = "id", ceklis?: AgendaCeklis, links?: AgendaLinks): AgendaRow[] {
  const date = eventDates(event)[day - 1];
  return date ? rowsOfDate(sessions, date, now, log, lang, ceklis, links) : [];
}

/** The same for a tab key ("2", or "h3" for a Persiapan day). */
export function agendaRowsOfTab(sessions: readonly MwSession[], tab: string, event: Pick<MainWamEventInfo, "startDate" | "endDate">, now: Date, log: readonly RundownChange[], lang: Lang = "id", ceklis?: AgendaCeklis, links?: AgendaLinks): AgendaRow[] {
  const date = tabDate(tab, event);
  return date ? rowsOfDate(sessions, date, now, log, lang, ceklis, links) : [];
}

function rowsOfDate(sessions: readonly MwSession[], date: string, now: Date, log: readonly RundownChange[], lang: Lang, ceklis?: AgendaCeklis, links?: AgendaLinks): AgendaRow[] {
  const shown = sessions.filter(session => session.status !== "draf");
  const isToday = date === wibDate(now.toISOString());
  const rows: AgendaRow[] = shown.filter(session => wibDate(session.startsAt) === date).sort(byStart).map(session => ({
    ...(ceklis ? ceklisOf(session, shown, ceklis, now) : {}),
    id: session.id,
    start: hhmm(session.startsAt, lang),
    end: session.endsAt ? hhmm(session.endsAt, lang) : "",
    title: session.title,
    place: placeLine(session, lang),
    status: session.status === "batal" ? "cancelled" : isRunning(session, now) ? "live" : hasEnded(session, now) ? "done" : "upcoming",
    changed: session.status !== "batal" && movedInRundown(session, log),
    kind: agendaKind(session),
    next: false,
    ...(session.usesAttendance && session.status !== "batal" ? { absen: session.required ? "wajib" as const : "ada" as const } : {}),
    ...(session.status !== "batal" && links?.quizSessions?.has(session.id) ? { kuis: true } : {}),
    ...(session.status !== "batal" && links?.missionPoints?.get(session.id) ? { misi: links.missionPoints.get(session.id) } : {}),
  }));
  const next = isToday ? rows.find(row => row.status === "upcoming") : undefined;
  if (next) next.next = true;
  return rows;
}

/**
 * Whether Rundown live moved the session: its log says the hours changed, or (the log not readable,
 * or older than the log) the session carries a change mark without any log entry.
 */
export function movedInRundown(session: Pick<MwSession, "id" | "startsAt" | "endsAt" | "changedAt">, log: readonly RundownChange[]): boolean {
  if (timeChange(session, log)) return true;
  return !!session.changedAt && !log.some(entry => entry.sessionId === session.id);
}

/** What a row says about checklists: its own progress, and whether absen here waits for another agenda's checklist. */
function ceklisOf(session: MwSession, all: readonly MwSession[], { lists, checked }: AgendaCeklis, now: Date): Pick<AgendaRow, "ceklis" | "ceklisFirst"> {
  const own = lists.get(session.id);
  const ahead = session.status === "terbit" && session.usesAttendance && !hasEnded(session, now) && ceklisBlock(session, all, lists, checked) !== null;
  return { ceklis: own?.items.length ? checklistProgress(own.items, checked) : null, ceklisFirst: ahead };
}

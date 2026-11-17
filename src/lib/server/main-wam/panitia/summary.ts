import "server-only";
import { attentionItems, kelolaTiles, requiredOpen, silentWaitingToday, type AttentionItem, type KelolaTile } from "@/lib/main-wam/panitia/attention";
import { awardStatus, dayAverage, departmentStats, sessionStats, summaryRows, type SessionStat, type SummaryRow } from "@/lib/main-wam/panitia/summary";
import { silentShownCount, silentState } from "@/lib/main-wam/module-state";
import { agendaDay, eventDates, eventDay, timeRange, wibDate } from "@/lib/main-wam/rundown";
import type { MwSession } from "@/lib/main-wam/types";
import { mainWamPath } from "@/lib/routes";
import { databaseError } from "../../http";
import { mwMissing } from "../errors";
import type { MainWamContext } from "../gate";
import { mainWamAttendees, mainWamPeople } from "../people";
import { allSessions, awardApprovals, awardCategories, silentQuestions, silentResults } from "../read";
import { carbonForEvent } from "./carbon";
import { db } from "./common";
import { waitingCount } from "./moderation";
import { eventDayTabs, type RundownDay } from "./rundown";

/*
 * BOD's Ringkasan (B01) and Kehadiran (B02), and panitia's cards on Beranda (K01): aggregates
 * only. Check-ins of a day are read in one query (the day's sessions at once), never per person.
 * "Orang acara" is fondasi's mainWamAttendees (every active WAM account but BOD), the same count
 * as Absen sesi and Detail sesi (audit R5).
 */

/** Who checked in at each of these sessions (one query). */
async function presentBySession(sessionIds: string[]): Promise<{ present: Map<string, Set<string>>; migrated: boolean }> {
  const present = new Map<string, Set<string>>(sessionIds.map(id => [id, new Set<string>()]));
  if (!sessionIds.length) return { present, migrated: true };
  const { data, error } = await db().from("mw_attendance").select("session_id,employee_id").in("session_id", sessionIds).limit(20000);
  if (error) { if (mwMissing(error)) return { present, migrated: false }; databaseError(error); }
  for (const row of data ?? []) present.get(row.session_id as string)?.add(row.employee_id as string);
  return { present, migrated: true };
}

/** The sessions of a WIB date that take attendance (published). */
const attendanceOfDate = (sessions: readonly MwSession[], date: string) => sessions.filter(session => session.status === "terbit" && session.usesAttendance && wibDate(session.startsAt) === date);

/* ── B01 Ringkasan ────────────────────────────────────────────────────────────────────────────── */

export type BodSummary = { migrated: boolean; rows: SummaryRow[] };

export async function bodSummary(context: MainWamContext, now = new Date()): Promise<BodSummary> {
  const { modules, event } = context.settings;
  const today = wibDate(now.toISOString());
  const day = eventDay(today, event)?.day ?? null;
  const [sessions, expected] = await Promise.all([allSessions(), modules.absen ? mainWamAttendees() : Promise.resolve([] as string[])]);

  const attendance = async () => {
    if (!modules.absen || day === null) return { percent: null, day };
    const todays = attendanceOfDate(sessions.data, today);
    const { present } = await presentBySession(todays.map(session => session.id));
    return { percent: dayAverage(sessionStats(todays, present, expected, now)), day };
  };
  const awards = async () => {
    if (!modules.voting) return { pending: 0, approved: 0 };
    const [categories, approvals] = await Promise.all([awardCategories(), awardApprovals()]);
    return awardStatus(categories.data, approvals.data, now);
  };
  // Silent Meeting: "Dibuka" while one is open, never a count then; afterwards only the counts of
  // those closed for good with 5 feedbacks of 5 people (audit H2).
  const silent = async () => {
    if (!modules.silent) return { feedback: 0, open: false };
    const [questions, results] = await Promise.all([silentQuestions(), silentResults()]);
    const open = questions.data.some(question => {
      const session = sessions.data.find(item => item.id === question.sessionId);
      return !!session && silentState(question, session, now) === "buka";
    });
    const feedback = questions.data.reduce((sum, question) => sum + (silentShownCount(results.data.get(question.id)) ?? 0), 0);
    return { feedback, open };
  };
  const carbon = async () => (modules.karbon ? (await carbonForEvent(context.settings))?.kg ?? null : null);
  const [attendanceValue, awardValue, silentValue, carbonValue] = await Promise.all([attendance(), awards(), silent(), carbon()]);
  return {
    migrated: sessions.migrated,
    rows: summaryRows({ modules, attendance: attendanceValue, awards: awardValue, silentFeedback: silentValue.feedback, silentOpen: silentValue.open, carbonKg: carbonValue }),
  };
}

/* ── B02 Kehadiran ────────────────────────────────────────────────────────────────────────────── */

export type AttendanceDayRow = { id: string; title: string; time: string; percent: number | null; state: SessionStat["state"]; href: string };
export type AttendanceDay = {
  migrated: boolean;
  day: number;
  days: RundownDay[];
  /** Rata-rata of the sessions that are over (or running); null before any started. */
  average: number | null;
  expected: number;
  /** "Sesi pertama mulai 06.00" while nothing has started. */
  firstStart: string | null;
  sessions: AttendanceDayRow[];
  departments: { department: string; percent: number }[];
};

export async function attendanceDay(context: MainWamContext, asked: string | number | undefined, now = new Date()): Promise<AttendanceDay> {
  const { event } = context.settings;
  const day = agendaDay(asked, wibDate(now.toISOString()), event);
  const date = eventDates(event)[day - 1] ?? "";
  const [sessions, expected, people] = await Promise.all([allSessions(), mainWamAttendees(), mainWamPeople()]);
  const ofDay = attendanceOfDate(sessions.data, date);
  const { present, migrated } = await presentBySession(ofDay.map(session => session.id));
  const stats = sessionStats(ofDay, present, expected, now);
  const roster = expected.map(id => ({ id, department: people.get(id)?.department ?? "" }));
  return {
    migrated: sessions.migrated && migrated, day, expected: expected.length,
    days: eventDayTabs(event, now, mainWamPath.attendanceSummary),
    average: dayAverage(stats),
    firstStart: stats[0] && stats.every(stat => stat.state === "upcoming") ? timeRange({ startsAt: stats[0].startsAt, endsAt: null }) : null,
    sessions: stats.map(stat => ({
      id: stat.id, title: stat.title, time: timeRange({ startsAt: stat.startsAt, endsAt: null }), state: stat.state, href: mainWamPath.session(stat.id),
      percent: stat.state === "upcoming" ? null : Math.round((stat.present / Math.max(stat.expected, 1)) * 100),
    })),
    departments: departmentStats(stats, present, roster),
  };
}

/* ── K01 Beranda panitia ──────────────────────────────────────────────────────────────────────── */

export type PanitiaHome = { tiles: KelolaTile[]; attention: AttentionItem[]; reported: number };

/** Kelola and Perlu perhatian. Fails soft: a part that cannot be read is left out, never the Beranda. */
export async function panitiaHome(context: MainWamContext, now = new Date()): Promise<PanitiaHome> {
  const { modules, event } = context.settings;
  const [reported, sessions] = await Promise.all([waitingCount(), allSessions().catch(() => ({ data: [] as MwSession[], migrated: false }))]);
  const required = async () => {
    if (!modules.absen) return [];
    const open = requiredOpen(sessions.data, now);
    if (!open.length) return [];
    const [expected, { present }] = await Promise.all([mainWamAttendees(), presentBySession(open.map(session => session.id))]);
    const everyone = new Set(expected);
    return open.map(session => ({ session, expected: everyone.size, present: [...(present.get(session.id) ?? [])].filter(id => everyone.has(id)).length }));
  };
  const silent = async () => {
    if (!modules.silent) return [];
    const { data: questions } = await silentQuestions();
    const today = wibDate(now.toISOString());
    const day = eventDay(today, event)?.day ?? 1;
    return questions.flatMap(question => {
      const session = sessions.data.find(item => item.id === question.sessionId);
      return session && silentWaitingToday(session, silentState(question, session, now), now) ? [{ session, day }] : [];
    });
  };
  const [requiredValue, silentValue] = await Promise.all([required().catch(() => []), silent().catch(() => [])]);
  return { reported, tiles: kelolaTiles(modules, reported), attention: attentionItems({ modules, reported, required: requiredValue, silent: silentValue }) };
}


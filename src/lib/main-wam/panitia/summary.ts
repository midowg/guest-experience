import { mainWamPath } from "@/lib/routes";
import { votingState } from "../module-state";
import { hasEnded, isRunning, wibDate } from "../rundown";
import type { ModuleSwitches, MwAwardApproval, MwAwardCategory, MwSession } from "../types";
import { carbonAmount, count, percent } from "./format";

/*
 * BOD's Ringkasan (B01, at most four rows) and Kehadiran (B02): aggregates only, never who. A
 * module that is off has no row (ANALISA_FITUR_16NOV §3). Kehadiran is Absen QR's, so it goes with
 * that module too. Pure.
 */

/* ── Kehadiran ────────────────────────────────────────────────────────────────────────────────── */

export type SessionStat = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  /** Present among the people expected. */
  present: number;
  expected: number;
  state: "done" | "live" | "upcoming";
};

/** Each session's count: present among the expected (someone outside the list does not push it past 100%). */
export function sessionStats(sessions: readonly Pick<MwSession, "id" | "title" | "startsAt" | "endsAt">[], present: ReadonlyMap<string, ReadonlySet<string>>, expected: readonly string[], now: Date): SessionStat[] {
  const everyone = new Set(expected);
  return [...sessions].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).map(session => {
    const here = present.get(session.id) ?? new Set<string>();
    let count = 0;
    for (const id of here) if (everyone.has(id)) count += 1;
    return {
      id: session.id, title: session.title, startsAt: session.startsAt, endsAt: session.endsAt, present: count, expected: everyone.size,
      state: hasEnded(session, now) ? "done" : isRunning(session, now) ? "live" : "upcoming",
    };
  });
}

/**
 * The day's average (prototype B02 "Rata-rata 93%" = the sessions that are over); while none is
 * over, the running ones; null before anything has started.
 */
export function dayAverage(stats: readonly SessionStat[]): number | null {
  const done = stats.filter(stat => stat.state === "done");
  const basis = done.length ? done : stats.filter(stat => stat.state === "live");
  if (!basis.length) return null;
  return Math.round(basis.reduce((sum, stat) => sum + percent(stat.present, stat.expected), 0) / basis.length);
}

/** Below this many people a department is not shown on its own (a percentage would point at someone). */
export const DEPARTMENT_MINIMUM = 5;
export const OTHER_DEPARTMENTS = "Departemen lain";

/**
 * Per departemen over the sessions that count for the day's average, highest first. A department
 * of fewer than 5 people joins "Departemen lain" (left out when that is still fewer than 5), so a
 * BOD never reads one person's attendance.
 */
export function departmentStats(stats: readonly SessionStat[], present: ReadonlyMap<string, ReadonlySet<string>>, people: readonly { id: string; department: string }[]): { department: string; percent: number }[] {
  const done = stats.filter(stat => stat.state === "done");
  const basis = done.length ? done : stats.filter(stat => stat.state === "live");
  if (!basis.length) return [];
  const groups = new Map<string, string[]>();
  for (const person of people) {
    const name = person.department.trim() || OTHER_DEPARTMENTS;
    groups.set(name, [...(groups.get(name) ?? []), person.id]);
  }
  const merged = new Map<string, string[]>();
  for (const [name, ids] of groups) {
    const key = ids.length < DEPARTMENT_MINIMUM ? OTHER_DEPARTMENTS : name;
    merged.set(key, [...(merged.get(key) ?? []), ...ids]);
  }
  const rows: { department: string; percent: number }[] = [];
  for (const [department, ids] of merged) {
    if (ids.length < DEPARTMENT_MINIMUM) continue;
    let here = 0;
    for (const stat of basis) { const set = present.get(stat.id); for (const id of ids) if (set?.has(id)) here += 1; }
    rows.push({ department, percent: percent(here, ids.length * basis.length) });
  }
  return rows.sort((a, b) => (a.department === OTHER_DEPARTMENTS ? 1 : 0) - (b.department === OTHER_DEPARTMENTS ? 1 : 0) || b.percent - a.percent || a.department.localeCompare(b.department, "id"));
}

/* ── Awarding ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * The categories a BOD has to approve now: a voting one once its voting has closed; a juri one from
 * its opening (or, without one, from the day it is announced). Otomatis needs no approval.
 */
export function awardStatus(categories: readonly MwAwardCategory[], approvals: readonly MwAwardApproval[], now: Date): { pending: number; approved: number } {
  const approved = new Set(approvals.map(approval => approval.categoryId));
  let pending = 0, done = 0;
  for (const category of categories) {
    if (!category.published || category.method === "otomatis") continue;
    if (approved.has(category.id)) { done += 1; continue; }
    const ready = category.method === "voting"
      ? votingState(category, now) === "tutup"
      : category.opensAt ? now.getTime() >= Date.parse(category.opensAt) : !category.announceAt || wibDate(now.toISOString()) >= wibDate(category.announceAt);
    if (ready) pending += 1;
  }
  return { pending, approved: done };
}

/* ── Ringkasan ────────────────────────────────────────────────────────────────────────────────── */

export type SummaryKey = "kehadiran" | "awarding" | "silent" | "karbon";
export type SummaryValue =
  | { kind: "angka"; value: string; unit?: string }
  | { kind: "pill"; tone: "warning" | "success"; text: string }
  /** "Belum ada" (dimmed). */
  | { kind: "kosong" };
/** One row; its name is its visible text (title and value), no separate label (WCAG 2.5.3, audit T-S05). */
export type SummaryRow = { key: SummaryKey; title: string; value: SummaryValue; href: string | null };

export type SummaryInput = {
  modules: ModuleSwitches;
  /** Today's average, its day (1–4) for the link; null = no data yet. */
  attendance: { percent: number | null; day: number | null };
  awards: { pending: number; approved: number };
  /** Feedbacks of the Silent Meetings closed for good with 5 feedbacks of 5 people (silentShownCount). */
  silentFeedback: number;
  /** A Silent Meeting is open now: its row says "Dibuka", never a count (audit H2). */
  silentOpen?: boolean;
  /** Jejak karbon in kg CO₂e, null while there is nothing to count. */
  carbonKg: number | null;
};

/** The rows the card shows now, in the design's order; a module that is off has none. */
export function summaryRows(input: SummaryInput): SummaryRow[] {
  const rows: SummaryRow[] = [];
  const none: SummaryValue = { kind: "kosong" };
  if (input.modules.absen) {
    const value: SummaryValue = input.attendance.percent === null ? none : { kind: "angka", value: `${input.attendance.percent}%` };
    rows.push({ key: "kehadiran", title: "Kehadiran hari ini", value, href: mainWamPath.attendanceSummary(input.attendance.day ?? undefined) });
  }
  if (input.modules.voting) {
    const { pending, approved } = input.awards;
    const value: SummaryValue = pending > 0 ? { kind: "pill", tone: "warning", text: count(pending) } : approved > 0 ? { kind: "pill", tone: "success", text: "Beres" } : none;
    rows.push({ key: "awarding", title: "Awarding perlu persetujuan", value, href: mainWamPath.awardApproval });
  }
  if (input.modules.silent) {
    const value: SummaryValue = input.silentOpen ? { kind: "pill", tone: "success", text: "Dibuka" }
      : input.silentFeedback > 0 ? { kind: "angka", value: count(input.silentFeedback), unit: "masukan" } : none;
    rows.push({ key: "silent", title: "Silent Meeting", value, href: mainWamPath.silentRecap });
  }
  if (input.modules.karbon) {
    // Tonnes from 0,1 t, kilograms below it (never "0,0 t": audit R16).
    const amount = input.carbonKg === null ? null : carbonAmount(input.carbonKg);
    const value: SummaryValue = amount === null ? none : { kind: "angka", value: amount.value, unit: amount.unit };
    rows.push({ key: "karbon", title: "Jejak karbon", value, href: null });
  }
  return rows;
}


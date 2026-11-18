import type { WbBoard, WbBoardRow, WbLedgerItem } from "@/lib/wellbeing/app-types";
import { addDays, monthRange } from "@/lib/wellbeing/rules";

/*
 * The monthly race (18 Nov 2026): the small pure pieces behind Beranda's race card, the board's
 * medals and Profil's records. Everything comes from data the app already has (no extra rules).
 */

const dayNumber = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000;

/** Days left in this month, today included (30 Nov → 1). */
export const daysLeft = (today: string) => dayNumber(monthRange(today).to) - dayNumber(today) + 1;
export const daysLeftLabel = (today: string) => { const left = daysLeft(today); return left <= 1 ? "Hari terakhir" : `Sisa ${left} hari`; };

/** What the race card says under my place. */
export type Chase =
  | { kind: "none" }
  /** progress: where I stand between the one behind me (0) and the one ahead (1); behind is null when nobody is. */
  | { kind: "chase"; ahead: WbBoardRow; behind: WbBoardRow | null; gap: number; progress: number }
  | { kind: "lead"; runnerUp: WbBoardRow | null; margin: number }
  | { kind: "tied"; with: WbBoardRow };

export function chaseOf(board: Pick<WbBoard, "me" | "ahead" | "items" | "near">): Chase {
  const me = board.me;
  if (!me || me.points <= 0) return { kind: "none" };
  if (board.ahead) {
    const gap = board.ahead.points - me.points;
    const behind = board.near.filter(row => !row.me && row.points < me.points).sort((a, b) => b.points - a.points)[0] ?? null;
    const floor = behind?.points ?? 0;
    return { kind: "chase", ahead: board.ahead, behind, gap, progress: Math.max(0, Math.min(1, (me.points - floor) / Math.max(1, board.ahead.points - floor))) };
  }
  // First place: shared with someone, or ahead of the next.
  const others = [...board.items, ...board.near].filter(row => !row.me);
  const tied = others.find(row => row.points === me.points);
  if (tied) return { kind: "tied", with: tied };
  const runnerUp = others.filter(row => row.points < me.points).sort((a, b) => b.points - a.points)[0] ?? null;
  return { kind: "lead", runnerUp, margin: runnerUp ? me.points - runnerUp.points : me.points };
}

/** The streak's flame is lit once today has a counted activity (the streak then runs through today). */
export const litToday = (totals: { streak: number; week: { date: string; points: number }[] }, today: string) =>
  totals.streak > 0 && (totals.week.find(day => day.date === today)?.points ?? 0) > 0;

export type Medal = "gold" | "silver" | "bronze";
export const medalOf = (rank: number): Medal | null => rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : null;

/**
 * What Peringkat shows on the page (18 Nov 2026), the rest waiting behind Lihat semua: the podium
 * (the first three rows), the chasers up to place `upTo`, and, when I am further down, the one
 * above me, me and the one below. `podiumGap` is how far I am from the podium (null on it, or
 * without points); `hidden` is how many rows only the full list shows.
 */
export function boardView(board: Pick<WbBoard, "items" | "me" | "near"> & { unranked?: WbBoard["unranked"] }, upTo = 8) {
  const podium = board.items.slice(0, 3);
  const chasers = board.items.slice(3, upTo);
  const shown = new Set([...podium, ...chasers].map(row => row.employeeId));
  let mine: WbBoardRow[] = [];
  if (board.me && !shown.has(board.me.employeeId)) {
    // The full list when it has me; an older answer listed only the top 30, so then the rows around me.
    const pool = board.items.some(row => row.me) ? board.items : board.near;
    const at = pool.findIndex(row => row.me);
    mine = pool.slice(Math.max(0, at - 1), at + 2).filter(row => !shown.has(row.employeeId));
  }
  const last = podium.at(-1);
  const podiumGap = board.me && last && board.me.rank > 3 ? Math.max(0, last.points - board.me.points) : null;
  const listed = new Set([...shown, ...mine.map(row => row.employeeId)]);
  // Lihat semua also lists who has no points yet (18 Nov 2026).
  const hidden = board.items.filter(row => !listed.has(row.employeeId)).length + (board.unranked?.length ?? 0);
  return { podium, chasers, mine, podiumGap, hidden };
}

/** Profil's records, from every point that counts for me: the best month, and the longest run of days with an activity. */
export function recordsOf(items: readonly WbLedgerItem[]): { bestMonth: { month: string; points: number } | null; longestStreak: number } {
  const months = new Map<string, number>();
  for (const item of items) months.set(item.date.slice(0, 7), (months.get(item.date.slice(0, 7)) ?? 0) + item.points);
  let bestMonth: { month: string; points: number } | null = null;
  for (const [month, points] of months) if (points > 0 && (!bestMonth || points > bestMonth.points || (points === bestMonth.points && month > bestMonth.month))) bestMonth = { month, points };

  const days = [...new Set(items.filter(item => item.kind === "activity" && item.points > 0).map(item => item.date))].sort();
  let longestStreak = 0, run = 0;
  days.forEach((day, index) => {
    run = index > 0 && addDays(days[index - 1], 1) === day ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  });
  return { bestMonth, longestStreak };
}

/**
 * My place compared with the last day I opened the app this month (kept on this device only):
 * delta positive when I climbed, negative when I dropped, since that day; null on the first look or a new month.
 */
export function rankTrend(storageKey: string, today: string, rank: number | null): { delta: number; since: string } | null {
  const month = today.slice(0, 7);
  type Seen = { month: string; day: string; rank: number | null; before: number | null; beforeDay?: string };
  let seen: Seen | null = null;
  try { seen = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as Seen | null; } catch { seen = null; }
  let next: Seen;
  if (!seen || seen.month !== month) next = { month, day: today, rank, before: null };
  else if (seen.day !== today) next = { month, day: today, rank, before: seen.rank, beforeDay: seen.day };
  else next = { ...seen, rank };
  try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* storage unavailable: no trend */ }
  return next.before != null && rank != null && next.beforeDay ? { delta: next.before - rank, since: next.beforeDay } : null;
}

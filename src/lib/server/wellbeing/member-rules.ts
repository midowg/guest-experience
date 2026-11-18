import { addDays, aroundMe, dimensionLabels, rank, type DimensionId, type ReviewStatus } from "@/lib/wellbeing/rules";
import type { WbBoardPerson, WbBoardRow, WbLedgerItem } from "@/lib/wellbeing/app-types";

/*
 * The employee app's sums (17 Nov 2026), pure so they are tested without a database: the streak,
 * the week, the board, and the ledger. Dates are WIB days (YYYY-MM-DD).
 */

/** Days in a row with at least one counted activity, ending today or (when today has none yet) yesterday. */
export function streakDays(dates: Iterable<string>, today: string): number {
  const days = new Set(dates);
  let day = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(day)) { streak++; day = addDays(day, -1); }
  return streak;
}

/** The first day of the streak that streakDays counts, or null without one. */
export function streakStart(dates: Iterable<string>, today: string): string | null {
  const days = new Set(dates);
  const length = streakDays(days, today);
  if (!length) return null;
  return addDays(days.has(today) ? today : addDays(today, -1), -(length - 1));
}

/** The last seven days, oldest first and today last, with the points counted on each. */
export function weekSeries(rows: readonly { date: string; points: number }[], today: string): { date: string; points: number }[] {
  const sums = new Map<string, number>();
  for (const row of rows) sums.set(row.date, (sums.get(row.date) ?? 0) + row.points);
  return Array.from({ length: 7 }, (_, index) => { const date = addDays(today, index - 6); return { date, points: sums.get(date) ?? 0 }; });
}

export type BoardPerson = { id: string; name: string; department: string; points: number; photo?: string | null };

/**
 * Peringkat: everyone with points above zero, highest first, ties sharing a place (1, 2, 2, 4) and
 * listed by name. `me` is the signed-in person's row (null without points); `top` rows are listed
 * (all of them unless given: the app shows a few and the rest under Lihat semua, 18 Nov 2026).
 */
/** Everyone left out of the places (no points above zero in the period), by name, for Lihat semua (18 Nov 2026). */
export function unrankedOf(people: readonly BoardPerson[], meId: string): WbBoardPerson[] {
  return people.filter(person => person.points <= 0).sort((a, b) => a.name.localeCompare(b.name, "id"))
    .map(person => ({ employeeId: person.id, name: person.name, department: person.department, points: person.points, me: person.id === meId, ...(person.photo ? { photo: person.photo } : {}) }));
}

export function board(people: readonly BoardPerson[], meId: string, top = Number.POSITIVE_INFINITY):{ items: WbBoardRow[]; me: WbBoardRow | null; near: WbBoardRow[]; ahead: WbBoardRow | null } {
  const ordered = people.filter(person => person.points > 0).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "id"));
  const rows: WbBoardRow[] = rank(ordered).map(person => ({ rank: person.rank, employeeId: person.id, name: person.name, department: person.department, points: person.points, me: person.id === meId,
    ...(person.photo ? { photo: person.photo } : {}) }));
  return { items: rows.slice(0, top), me: rows.find(row => row.me) ?? null, ...aroundMe(rows) };
}

/** My place among these people (ties share it, as in board), or null with no points above zero. */
export function placeOf(people: readonly { id: string; points: number }[], meId: string): number | null {
  const mine = people.find(person => person.id === meId)?.points ?? 0;
  return mine > 0 ? 1 + people.filter(person => person.points > mine).length : null;
}

export type LedgerActivity = {
  date: string; createdAt: string; title: string; typeName: string; dimension: DimensionId; source: "manual" | "strava" | "import";
  steps: number | null; kcal: number | null; minutes: number | null; points: number; status: ReviewStatus;
};
export type LedgerEntry = { date: string; createdAt: string; reason: string; points: number; dimension: DimensionId | null; kind: "admin" | "import" };

const number = (value: number) => value.toLocaleString("id-ID");

/**
 * Riwayat poin: every activity that counts (not rejected) and every admin or imported entry that
 * counts (not voided), newest first (by date, then by when it was recorded), and their sum.
 */
export function ledgerItems(activities: readonly LedgerActivity[], entries: readonly LedgerEntry[]): { items: WbLedgerItem[]; total: number } {
  const rows: { date: string; createdAt: string; item: WbLedgerItem }[] = [];
  for (const activity of activities) {
    if (activity.status === "rejected") continue;
    const facts = [
      dimensionLabels[activity.dimension],
      activity.steps !== null ? `${number(activity.steps)} langkah` : null,
      activity.kcal !== null ? `${number(activity.kcal)} kkal` : null,
      activity.minutes !== null ? `${number(activity.minutes)} menit` : null,
      activity.source === "strava" ? "Strava" : activity.source === "import" ? "Aplikasi lama" : null,
      activity.status === "adjusted" ? "Poin diubah admin" : null,
    ].filter(Boolean);
    rows.push({ date: activity.date, createdAt: activity.createdAt, item: { date: activity.date, title: activity.title || activity.typeName, sub: facts.join(" · "), points: activity.points, kind: "activity", dimension: activity.dimension } });
  }
  for (const entry of entries) {
    const sub = [entry.kind === "import" ? "Saldo dari aplikasi lama" : "Dari admin", entry.dimension ? dimensionLabels[entry.dimension] : null].filter(Boolean).join(" · ");
    rows.push({ date: entry.date, createdAt: entry.createdAt, item: { date: entry.date, title: entry.reason, sub, points: entry.points, kind: entry.kind, dimension: entry.dimension } });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return { items: rows.map(row => row.item), total: rows.reduce((sum, row) => sum + row.item.points, 0) };
}

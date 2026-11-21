import { abbreviateDepartment } from "./missions";

/*
 * The Peringkat: everyone of the event ranked by their points (the sum of their ledger rows).
 * Competition ranking: equal points share a place and the next place is skipped (1, 2, 2, 4), so
 * "Peringkat 7 dari 118" means six people have more points. Privacy (aturan-wam §4): a row carries
 * the nama panggilan, the department's short form and the points, nothing else, and never an id: the
 * browser only learns which row is its own. Pure.
 */

export type RankPerson = { id: string; name: string; department: string; points: number; missions: number };
/** What leaves the server: no id, only whether it is the asker's row. */
export type RankRow = { rank: number; name: string; department: string; points: number; me: boolean };

/** Most points first; equal points: more missions done, then by name (Indonesian order), then id (a fixed order). Ids stay: for Admin WAM, which names everyone in full. */
export function rankOrder<T extends RankPerson>(people: readonly T[]): (T & { rank: number })[] {
  const sorted = [...people].sort((a, b) => b.points - a.points || b.missions - a.missions || a.name.localeCompare(b.name, "id") || a.id.localeCompare(b.id));
  let rank = 0;
  return sorted.map((person, index) => {
    if (index === 0 || person.points !== sorted[index - 1].points) rank = index + 1;
    return { ...person, rank };
  });
}

/** What participants get: no id, only whether the row is theirs. */
export const rankPeople = (people: readonly RankPerson[], meId: string): RankRow[] =>
  rankOrder(people).map(person => ({ rank: person.rank, name: person.name, department: abbreviateDepartment(person.department), points: person.points, me: person.id === meId }));

/** The asker's place: their row, and how many are ranked. */
export function myPlace(rows: readonly RankRow[]): { rank: number; of: number; points: number } | null {
  const mine = rows.find(row => row.me);
  return mine ? { rank: mine.rank, of: rows.length, points: mine.points } : null;
}

export const MEDALS = [1, 2, 3] as const;
export const medalOf = (rank: number): 1 | 2 | 3 | null => (rank >= 1 && rank <= 3 ? (rank as 1 | 2 | 3) : null);

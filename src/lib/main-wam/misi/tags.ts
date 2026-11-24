import { TAG_RELATIONS, type TagCandidate, type TagRelation } from "./rules";

/*
 * Tagging friends on a mission photo, the pure part: who sits next to whom on the train (from the seat
 * text "Gerbong 3 · Kursi 12A"), which candidates a tag rule suggests, and the name search. The server
 * (server/main-wam/misi/tags.ts) fills the candidates; nothing here reads a database.
 */

/** "Gerbong 3 · Kursi 12A" → coach "gerbong 3", row "12" (a plain "12B" has no coach; a seat needs its letter, so "Bus 2" is no seat). Null when there is no row number. */
export function seatParts(seat: string): { coach: string; row: string } | null {
  const [first, second] = seat.includes("·") ? seat.split("·").map(part => part.trim()) : ["", seat.trim()];
  const row = /(\d+)\s*[A-Za-z]\s*$/.exec(second ?? "")?.[1];
  return row ? { coach: (first ?? "").toLowerCase(), row } : null;
}

/** Everyone on the same trip, in the same coach and row as one of my seats ("sebangku"), never me. */
export function seatmatesOf(meId: string, seats: readonly { tripId: string; employeeId: string; seat: string }[]): Set<string> {
  const mine = seats.filter(seat => seat.employeeId === meId).map(seat => ({ tripId: seat.tripId, parts: seatParts(seat.seat) })).filter(seat => seat.parts);
  const out = new Set<string>();
  for (const seat of seats) {
    if (seat.employeeId === meId) continue;
    const parts = seatParts(seat.seat);
    if (parts && mine.some(own => own.tripId === seat.tripId && own.parts!.coach === parts.coach && own.parts!.row === parts.row)) out.add(seat.employeeId);
  }
  return out;
}

export type SuggestionReason = "sebangku" | "sekamar" | "bod";

/** Why a candidate is suggested for a tag rule's relation, or null (not suggested). */
export function suggestionReason(candidate: TagCandidate, relation: TagRelation): SuggestionReason | null {
  if (relation === "bod") return candidate.bod ? "bod" : null;
  if (relation === "sebangku") return candidate.seatmate ? "sebangku" : null;
  if (relation === "sekamar") return candidate.roommate ? "sekamar" : null;
  return null;
}

export const isRelation = (value: string): value is TagRelation => (TAG_RELATIONS as readonly string[]).includes(value);

/** The suggestions first (for the relation), then the rest by name; a query keeps the names that contain it. */
export function orderCandidates(candidates: readonly TagCandidate[], relation: TagRelation, query = ""): { suggested: TagCandidate[]; others: TagCandidate[] } {
  const needle = query.trim().toLowerCase();
  const match = (candidate: TagCandidate) => !needle || candidate.name.toLowerCase().includes(needle) || candidate.department.toLowerCase().includes(needle);
  const byName = (a: TagCandidate, b: TagCandidate) => a.name.localeCompare(b.name, "id");
  const shown = candidates.filter(match);
  return {
    suggested: shown.filter(candidate => suggestionReason(candidate, relation)).sort(byName),
    others: shown.filter(candidate => !suggestionReason(candidate, relation)).sort(byName),
  };
}

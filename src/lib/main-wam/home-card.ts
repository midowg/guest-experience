import type { MainWamModule, ModuleSwitches } from "./types";

/*
 * Beranda's one contextual card (P01 revisi 16 Nov): at most one card under Sekarang, the first that
 * applies in this order (SPEC P01__status):
 *   1. pengumuman penting tersemat (banner)
 *   2. Silent Meeting dibuka → "Kirim masukan" (T01)
 *   3. voting Awarding dibuka → "Pilih nominasi" (V01)
 *   4. hari berangkat (or pulang) → "Lihat tiket" (L03)
 *   5. survei dibuka → "Isi survei"
 * A candidate whose module is off never shows (no trace of a module that is off). Pure.
 */

export type HomeCardCandidate =
  | { kind: "pengumuman"; id: string; title: string; body: string; pinnedUntil: string }
  | { kind: "silent"; questionId: string; sessionId: string; closesAt: string }
  | { kind: "voting"; categoryId: string; title: string; closesAt: string | null }
  | { kind: "berangkat"; direction: "berangkat" | "pulang"; tripId: string; title: string; startsAt: string | null; seat: string }
  | { kind: "survei"; formSlug: string; title: string };
export type HomeCardKind = HomeCardCandidate["kind"];

export const HOME_CARD_ORDER: readonly HomeCardKind[] = ["pengumuman", "silent", "voting", "berangkat", "survei"];
/** The module a card needs on; pengumuman and berangkat are core (always there). */
export const homeCardModule: Partial<Record<HomeCardKind, MainWamModule>> = { silent: "silent", voting: "voting", survei: "survei" };

/**
 * The card to show, or null. Candidates are what the server found for this person now (a pinned
 * announcement still pinned, a Silent Meeting open that they may send to, an open category they
 * have not voted in, a travel day, a survey not done); this only orders them and drops the ones
 * whose module is off.
 */
export function pickHomeCard(candidates: readonly HomeCardCandidate[], modules: ModuleSwitches, now: Date): HomeCardCandidate | null {
  const allowed = candidates.filter(card => {
    const needs = homeCardModule[card.kind];
    if (needs && !modules[needs]) return false;
    if (card.kind === "pengumuman") return Date.parse(card.pinnedUntil) > now.getTime();
    return true;
  });
  // Within a kind the server's order holds (newest first): two pinned announcements show the newest.
  for (const kind of HOME_CARD_ORDER) {
    const found = allowed.find(card => card.kind === kind);
    if (found) return found;
  }
  return null;
}

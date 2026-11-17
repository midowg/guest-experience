import { sessionEnd } from "./rundown";
import type { MwAwardCategory, MwSession, MwSilentQuestion } from "./types";

/*
 * When a module's moment is open (shared by Beranda's card, the session's action, panitia's
 * Rundown live row and BOD's Ringkasan). Pure.
 */

export type SilentState = "belum" | "buka" | "tutup";

/**
 * Silent Meeting opens at its session's start and closes at its end ("buka dan tutup otomatis
 * mengikuti jam sesi"). Panitia may open it before the start ("Buka sekarang") and close it before
 * the end ("Tutup sekarang"), each once. Closed is final: by panitia, by the end, or with the session
 * cancelled, it never opens again (audit H2; the database stamps the close before a session's hours
 * change, mw_silent_session_moved). The same rule as mw_silent_state (migration 202611200003), which
 * holds it by the server's clock.
 */
export function silentState(question: Pick<MwSilentQuestion, "openedAt" | "closedAt">, session: Pick<MwSession, "startsAt" | "endsAt" | "status">, now: Date): SilentState {
  if (question.closedAt || session.status === "batal") return "tutup";
  // A draft session is not in the app: its question is not open either (the database agrees).
  if (session.status !== "terbit") return "belum";
  if (now.getTime() >= Date.parse(sessionEnd(session))) return "tutup";
  if (question.openedAt || now.getTime() >= Date.parse(session.startsAt)) return "buka";
  return "belum";
}

/** When it closes by itself: its session's end (null once it is closed). */
export function silentClosesAt(question: Pick<MwSilentQuestion, "closedAt">, session: Pick<MwSession, "startsAt" | "endsAt">): string | null {
  return question.closedAt ? null : sessionEnd(session);
}

/** BOD reads the recap only from 5 feedbacks and 5 people who opened it, so a sender cannot be guessed (SPEC T01, B05). */
export const SILENT_RECAP_MINIMUM = 5;
export const silentRecapReady = (count: number) => count >= SILENT_RECAP_MINIMUM;

/**
 * The counts of a Silent Meeting closed for good (mw_silent_results): how many feedbacks and how
 * many different people opened its form. There is none while it is open.
 */
export type SilentResult = { feedback: number; openers: number };
/** The one number anyone may see: the feedbacks, once closed and only from 5 feedbacks of 5 people. */
export function silentShownCount(result: SilentResult | null | undefined): number | null {
  return result && silentRecapReady(result.feedback) && result.openers >= SILENT_RECAP_MINIMUM ? result.feedback : null;
}

export type VotingState = "belum" | "buka" | "tutup";
/** A voting category's window (published, method voting). Juri and otomatis are never "buka". */
export function votingState(category: Pick<MwAwardCategory, "method" | "published" | "opensAt" | "closesAt">, now: Date): VotingState {
  if (!category.published || category.method !== "voting" || !category.opensAt || !category.closesAt) return "belum";
  if (now.getTime() < Date.parse(category.opensAt)) return "belum";
  return now.getTime() < Date.parse(category.closesAt) ? "buka" : "tutup";
}

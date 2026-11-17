import { sessionEnd } from "./rundown";
import type { MwAwardCategory, MwSession, MwSilentQuestion } from "./types";

/*
 * When a module's moment is open (shared by Beranda's card, the session's action, panitia's
 * Rundown live row and BOD's Ringkasan). Pure.
 */

export type SilentState = "belum" | "buka" | "tutup";

/**
 * Silent Meeting opens with its session's start and closes at its end ("buka dan tutup otomatis
 * mengikuti jam sesi"); panitia's override wins: "buka" opens it now (also before the start, and
 * past the end while it stays), "tutup" closes it. Without "Tutup otomatis" an opened question stays
 * open after the end until panitia closes it. The database holds the same rule when feedback is
 * saved (mw_silent_feedback_open, migration 202611200003), by the server's clock.
 */
export function silentState(question: Pick<MwSilentQuestion, "override" | "autoClose">, session: Pick<MwSession, "startsAt" | "endsAt" | "status">, now: Date): SilentState {
  if (session.status === "batal") return "tutup";
  // A draft session is not in the app: its question is not open either (the database agrees).
  if (session.status !== "terbit") return "belum";
  if (question.override === "tutup") return "tutup";
  const start = Date.parse(session.startsAt), end = Date.parse(sessionEnd(session));
  if (question.override === "buka") return question.autoClose && now.getTime() >= end ? "tutup" : "buka";
  if (now.getTime() < start) return "belum";
  if (now.getTime() < end) return "buka";
  return "tutup";
}

/** When it closes by itself (null: only panitia closes it, or it is closed). */
export function silentClosesAt(question: Pick<MwSilentQuestion, "override" | "autoClose">, session: Pick<MwSession, "startsAt" | "endsAt">): string | null {
  if (question.override === "tutup" || !question.autoClose) return null;
  return sessionEnd(session);
}

/** BOD reads the recap only from 5 feedbacks, so a sender cannot be guessed (SPEC T01, B05). */
export const SILENT_RECAP_MINIMUM = 5;
export const silentRecapReady = (count: number) => count >= SILENT_RECAP_MINIMUM;

export type VotingState = "belum" | "buka" | "tutup";
/** A voting category's window (published, method voting). Juri and otomatis are never "buka". */
export function votingState(category: Pick<MwAwardCategory, "method" | "published" | "opensAt" | "closesAt">, now: Date): VotingState {
  if (!category.published || category.method !== "voting" || !category.opensAt || !category.closesAt) return "belum";
  if (now.getTime() < Date.parse(category.opensAt)) return "belum";
  return now.getTime() < Date.parse(category.closesAt) ? "buka" : "tutup";
}

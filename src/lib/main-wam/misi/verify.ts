import type { RuleCheck } from "./rules";
import type { CompletionStatus } from "./types";

/*
 * The road of a proof (pure; the server's verifier.ts and review.ts use it, and so do the screens):
 *   dikirim → diperiksa → disetujui | perlu_ditinjau | ditolak
 * The rules the server can check without AI come first (rules.ts → checkRules); a violation is a
 * rejection with its reasons. Then the verifier, which says lolos, gagal or ragu. Points come only with
 * "disetujui" (the database's trigger mw_completion_points).
 */

export type VerifierVerdict = "lolos" | "gagal" | "ragu";
export type VerifierResult = { putusan: VerifierVerdict; alasan: string[]; skor?: number };

/** What is stored with a completion (mw_mission_completions.check_result) and shown to the reviewer. */
export type CheckResult = {
  checks: RuleCheck[];
  /** null when the rules alone rejected it (the verifier was never asked). */
  verifier: { provider: string; result: VerifierResult } | null;
  decidedAt: string;
};

/** The statuses a person is waiting in. */
export const WAITING_STATUSES: readonly CompletionStatus[] = ["dikirim", "diperiksa"];
/** The statuses in panitia / admin's review queue ("menunggu" is perlu_ditinjau of before the migration). */
export const REVIEW_STATUSES: readonly CompletionStatus[] = ["perlu_ditinjau", "menunggu"];

const NEXT: Record<CompletionStatus, readonly CompletionStatus[]> = {
  dikirim: ["diperiksa", "disetujui", "ditolak"],
  diperiksa: ["disetujui", "perlu_ditinjau", "ditolak"],
  perlu_ditinjau: ["disetujui", "ditolak"],
  menunggu: ["disetujui", "ditolak"],
  // Sent again (a new try) starts the road again; an admin may take an approved one back, or approve a rejected one.
  ditolak: ["dikirim", "disetujui"],
  disetujui: ["ditolak"],
};
export const canMove = (from: CompletionStatus, to: CompletionStatus) => NEXT[from].includes(to);

export type Decision = { status: Extract<CompletionStatus, "disetujui" | "perlu_ditinjau" | "ditolak">; reasons: string[] };

/**
 * The end of the road: a broken rule rejects; else the verifier's word (lolos approves, gagal rejects
 * with its reasons, ragu goes to review). A mission that asks for review (`review`) never approves by
 * itself: a "lolos" waits for a person too.
 */
export function decide(input: { ruleReasons: readonly string[]; verifier: VerifierResult | null; review: boolean }): Decision {
  if (input.ruleReasons.length) return { status: "ditolak", reasons: [...input.ruleReasons] };
  const result = input.verifier;
  if (!result || result.putusan === "ragu") return { status: "perlu_ditinjau", reasons: result?.alasan ?? [] };
  if (result.putusan === "gagal") return { status: "ditolak", reasons: result.alasan.length ? [...result.alasan] : ["Foto belum memenuhi syarat misi."] };
  return input.review ? { status: "perlu_ditinjau", reasons: result.alasan } : { status: "disetujui", reasons: [] };
}

/** Can a person send again? Only after a rejection, and only while the limit (batas_kali) allows. */
export const canResend = (status: CompletionStatus, attempts: number, limit: number | null) => status === "ditolak" && (limit === null || attempts < limit);

/** The reasons as one line for the review_note column (≤ 300 characters). */
export const reasonLine = (reasons: readonly string[]) => reasons.join(" ").slice(0, 300);

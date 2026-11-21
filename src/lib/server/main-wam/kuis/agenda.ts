import "server-only";
import { KUIS_AGENDA_MIGRATION } from "@/lib/main-wam/kuis/admin";
import type { QuizPhase } from "@/lib/main-wam/kuis/types";
import { createPrivilegedClient } from "../../supabase/admin";
import { mwFail, mwMissing } from "../errors";
import { ServiceError } from "../../config";
import { isId, notFound } from "./store";

/*
 * Kuis live and the agenda (rancangan-kuis-wam.md): a quiz is tied to the rundown's item "Kuis live"
 * (mw_quizzes.session_id, migration 202611270001), so that item's Detail sesi shows "Ikut kuis" while a
 * game is on. Before the migration nothing is tied (readers answer "no", the writer 503s).
 */

const db = () => createPrivilegedClient();

export type AgendaChoice = { id: string; title: string; startsAt: string; status: string };
export type QuizAgenda = { migrated: boolean; sessionId: string | null; sessions: AgendaChoice[] };

/** Admin: the item this quiz is tied to, and the rundown to choose from (the sessions, earliest first). */
export async function quizAgenda(quizId: string): Promise<QuizAgenda> {
  if (!isId(quizId)) throw notFound();
  const [quiz, sessions] = await Promise.all([
    db().from("mw_quizzes").select("id,session_id").eq("id", quizId).maybeSingle(),
    db().from("mw_sessions").select("id,title,starts_at,status").eq("kind", "sesi").neq("status", "batal").order("starts_at").limit(200),
  ]);
  if (sessions.error) mwFail(sessions.error);
  const list = ((sessions.data ?? []) as { id: string; title: string; starts_at: string; status: string }[]).map(row => ({ id: row.id, title: row.title, startsAt: row.starts_at, status: row.status }));
  if (quiz.error) {
    if (mwMissing(quiz.error)) {
      // The column is not there yet: the quiz exists, nothing is tied.
      const plain = await db().from("mw_quizzes").select("id").eq("id", quizId).maybeSingle();
      if (plain.error) mwFail(plain.error);
      if (!plain.data) throw notFound();
      return { migrated: false, sessionId: null, sessions: list };
    }
    mwFail(quiz.error, KUIS_AGENDA_MIGRATION);
  }
  if (!quiz.data) throw notFound();
  return { migrated: true, sessionId: (quiz.data as { session_id: string | null }).session_id ?? null, sessions: list };
}

/** Admin: tie the quiz to an agenda item (or untie with null). One item can have one quiz: a second takes it over. */
export async function setQuizAgenda(quizId: string, sessionId: string | null): Promise<void> {
  if (!isId(quizId)) throw notFound();
  if (sessionId) {
    const { data, error } = await db().from("mw_sessions").select("id").eq("id", sessionId).maybeSingle();
    if (error) mwFail(error);
    if (!data) throw notFound("Agenda tidak ditemukan.");
    // The item has one quiz: untie any other first.
    const other = await db().from("mw_quizzes").update({ session_id: null }).eq("session_id", sessionId).neq("id", quizId);
    if (other.error) mwFail(other.error, KUIS_AGENDA_MIGRATION);
  }
  const { data, error } = await db().from("mw_quizzes").update({ session_id: sessionId, updated_at: new Date().toISOString() }).eq("id", quizId).select("id");
  // 202611280001 (unique per agenda): two admins saving at once, the other one won.
  if (error?.code === "23505") throw new ServiceError(409, "Agenda ini baru saja dipasangi kuis lain. Muat ulang lalu coba lagi.");
  if (error) mwFail(error, KUIS_AGENDA_MIGRATION);
  if (!data?.length) throw notFound();
}

/** A phone: the quiz tied to this agenda item and where its game is (null: none, no game yet, or not migrated). */
export async function quizOfSession(sessionId: string): Promise<{ quizId: string; title: string; phase: QuizPhase | null } | null> {
  const { data, error } = await db().from("mw_quizzes").select("id,title,mw_quiz_runs(phase,number)").eq("session_id", sessionId).limit(1);
  if (error || !data?.length) return null;
  const row = data[0] as unknown as { id: string; title: string; mw_quiz_runs: { phase: QuizPhase; number: number }[] | null };
  const latest = [...(row.mw_quiz_runs ?? [])].sort((a, b) => b.number - a.number)[0];
  return { quizId: row.id, title: row.title, phase: latest?.phase ?? null };
}

import "server-only";
import { DEMO_QUIZ_ID, demoPlay } from "@/lib/main-wam/kuis/demo";
import { DEMO_WRITE_MESSAGE } from "@/lib/main-wam/demo";
import { flowOf, buildPlay, needsAnswers, tallyRange } from "@/lib/main-wam/kuis/snapshot";
import { answerOpen, snapshotVersion, soalTimes } from "@/lib/main-wam/kuis/flow";
import { correctPoints, judgeAnswer } from "@/lib/main-wam/kuis/rules";
import type { PlaySnapshot } from "@/lib/main-wam/kuis/types";
import { ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";
import type { MainWamContext } from "../gate";
import { mwFail } from "../errors";
import { KUIS_MIGRATION } from "@/lib/main-wam/kuis/admin";
import { figureAlias } from "./alias";
import { mineOf, notFound, playerCount, questionAnswers, quizAndRun, tallies } from "./store";

/*
 * A player's phone (rancangan §4, §4a): the game as they may see it, joining, answering. Everyone who may
 * see Main WAM plays (BOD too); the gate (requireModuleApi("kuis")) has run. Cost of one poll (on top of
 * the gate): 1 query when nothing changed (the quiz with its latest game), 2 in the lobby (+ how many
 * joined); when something changed up to 4: + my row and answers, + everyone's totals and the question's
 * answers only once the answer is open (or at the scoreboard and the end).
 */

const db = () => createPrivilegedClient();

/** The game on this phone; `version` = the one it has (unchanged: only the clock comes back). */
export async function playState(context: MainWamContext, quizId: string, version: string | null, now = Date.now()): Promise<PlaySnapshot> {
  // Mode demo: the sample quiz plays itself (nothing is stored).
  if (context.settings.moduleConfig?.demo && quizId === DEMO_QUIZ_ID) return demoPlay(now, version);
  const { quiz, run, migrated } = await quizAndRun(quizId);
  if (!migrated) throw new ServiceError(503, "Fitur ini menunggu pembaruan sistem. Hubungi tim CoE.");
  if (!quiz) throw notFound();
  const v = snapshotVersion(run ? flowOf(run) : null, now);
  const empty: PlaySnapshot = { serverNow: now, v, quiz, run: null, question: null, lobby: null, me: null, spread: null, board: null, final: null, remaining: 0 };
  if (!run) return empty;
  if (version === v) {
    // Nothing changed: only the clock, and in the lobby how many joined (it grows without a new rev).
    return { ...empty, same: true, lobby: run.phase === "lobi" ? { players: await playerCount(run.id) } : null };
  }
  const range = tallyRange(run, now);
  const [mine, rows, answers] = await Promise.all([
    mineOf(run.id, context.viewer.id),
    range ? tallies(run.id, range.upto, range.prev) : null,
    needsAnswers(run, now) ? questionAnswers(run.id, run.index) : null,
  ]);
  const players = rows ? rows.length : await playerCount(run.id);
  return buildPlay({ quiz, run, now, players, mine, employeeId: context.viewer.id, tallies: rows, answers });
}

/** Ikut: join the game in play as one's tokoh (or Tokoh misterius #NN). Joining twice is not an error. */
export async function joinGame(context: MainWamContext, quizId: string, runId: string): Promise<PlaySnapshot> {
  if (quizId === DEMO_QUIZ_ID) throw new ServiceError(403, DEMO_WRITE_MESSAGE);
  const { quiz, run, migrated } = await quizAndRun(quizId);
  if (!migrated) throw new ServiceError(503, "Fitur ini menunggu pembaruan sistem. Hubungi tim CoE.");
  if (!quiz || !run) throw notFound();
  if (run.id !== runId) throw new ServiceError(409, "Permainan ini sudah diganti. Muat ulang untuk ikut yang baru.");
  const alias = await figureAlias(context.viewer.id);
  const { data, error } = await db().rpc("mw_quiz_join", {
    p_run: run.id, p_employee: context.viewer.id, p_figure: alias?.figure ?? null, p_alias: alias?.alias ?? null, p_persona: alias?.persona ?? null, p_colors: alias?.colors ?? null,
  });
  if (error) mwFail(error, KUIS_MIGRATION);
  if (data === "tutup") throw new ServiceError(409, run.phase === "siap" ? "Kuis belum dibuka. Tunggu aba-aba MC." : "Kuis ini sudah selesai.");
  if (data === "unknown") throw notFound();
  return playState(context, quizId, null);
}

export type AnswerResult = { choice: number; value: number; ms: number };

/**
 * An answer: one per person per question, only while it runs (and at most 2 s after time is up), the
 * tap time checked against the server's clock (rules.ts judgeAnswer). The reply says the value that is
 * locked (what a right answer gets), never whether it is right. A second answer of the same person gets
 * the first one back (a retry after a lost reply is not an error; a different option is not taken).
 */
export async function answerQuestion(context: MainWamContext, quizId: string, input: { runId: string; index: number; choice: number; tapAt: number }, recvAt = Date.now()): Promise<AnswerResult> {
  if (quizId === DEMO_QUIZ_ID) throw new ServiceError(403, DEMO_WRITE_MESSAGE);
  const { run, migrated } = await quizAndRun(quizId);
  if (!migrated) throw new ServiceError(503, "Fitur ini menunggu pembaruan sistem. Hubungi tim CoE.");
  if (!run || run.id !== input.runId) throw new ServiceError(409, "Permainan ini sudah diganti.");
  if (run.phase !== "soal" || run.index !== input.index) throw new ServiceError(409, "Soal ini sudah ditutup.");
  if (answerOpen(flowOf(run), recvAt)) throw new ServiceError(409, "Waktu habis.");
  const question = run.questions[run.index];
  if (!question) throw new ServiceError(409, "Soal ini sudah ditutup.");
  const durMs = soalTimes(question.level).durMs;
  const verdict = judgeAnswer({ phaseAt: run.phaseAt, pauses: run.pauses, durMs, tapAt: input.tapAt, recvAt });
  if (!verdict.ok) {
    throw new ServiceError(409, verdict.reason === "jeda" ? "Kuis sedang dijeda." : verdict.reason === "belum" ? "Soal belum dibuka." : "Waktu habis.");
  }
  const correct = input.choice === question.correct;
  const points = correct ? correctPoints(verdict.ms, durMs) : -100;
  const { data, error } = await db().from("mw_quiz_answers").upsert({
    run_id: run.id, question_index: run.index, employee_id: context.viewer.id, choice: input.choice, ms: verdict.ms, correct, points,
    tapped_at: new Date(verdict.tapAt).toISOString(), received_at: new Date(recvAt).toISOString(),
  }, { onConflict: "run_id,question_index,employee_id", ignoreDuplicates: true }).select("choice,ms");
  if (error) {
    // Not in the game (never tapped Ikut, or the game was replaced).
    if (error.code === "23503") throw new ServiceError(409, "Ketuk Ikut dulu untuk bermain.");
    mwFail(error, KUIS_MIGRATION);
  }
  const saved = (data ?? [])[0] as { choice: number; ms: number } | undefined;
  if (saved) return { choice: saved.choice, ms: saved.ms, value: correctPoints(saved.ms, durMs) };
  // Answered before: that answer stands.
  const { data: first, error: firstError } = await db().from("mw_quiz_answers").select("choice,ms").eq("run_id", run.id).eq("question_index", run.index).eq("employee_id", context.viewer.id).maybeSingle();
  if (firstError) mwFail(firstError, KUIS_MIGRATION);
  if (!first) throw new ServiceError(409, "Jawaban belum tersimpan. Coba lagi.");
  return { choice: first.choice as number, ms: first.ms as number, value: correctPoints(first.ms as number, durMs) };
}

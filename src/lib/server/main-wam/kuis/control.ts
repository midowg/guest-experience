import "server-only";
import { after } from "next/server";
import { applyAction, type ControlAction } from "@/lib/main-wam/kuis/flow";
import { buildControl, flowOf, needsAnswers } from "@/lib/main-wam/kuis/snapshot";
import type { ControlSnapshot } from "@/lib/main-wam/kuis/types";
import { mainWamPath } from "@/lib/routes";
import { ServiceError } from "../../config";
import type { MainWamContext } from "../gate";
import { trySendMainWamNote } from "../notes";
import { answeredCount, isQuizHost, notFound, playerCount, questionAnswers, quizAndRun, saveRun } from "./store";

/*
 * The MC's control (rancangan §7): only a pengendali chosen for this quiz in Admin WAM, or Admin WAM
 * (the role); for anyone else the control does not exist (404, KONTRAK §9 #19). Cost of one poll (on
 * top of the gate): the host check (none for Admin WAM), the quiz with its game, how many joined, during
 * a question how many answered, and once its answer is open the answers (the share right).
 */

async function hostOnly(context: MainWamContext, quizId: string): Promise<void> {
  if (!(await isQuizHost(quizId, context.viewer))) throw notFound("Halaman tidak ditemukan.");
}

export async function controlState(context: MainWamContext, quizId: string, now = Date.now()): Promise<ControlSnapshot> {
  await hostOnly(context, quizId);
  const { quiz, run, migrated } = await quizAndRun(quizId);
  if (!migrated) throw new ServiceError(503, "Fitur ini menunggu pembaruan sistem. Hubungi tim CoE.");
  if (!quiz) throw notFound();
  if (!run) return buildControl({ quiz, run: null, now, players: 0, answered: null, answers: null });
  const [players, answered, answers] = await Promise.all([
    playerCount(run.id),
    run.phase === "soal" ? answeredCount(run.id, run.index) : null,
    needsAnswers(run, now) ? questionAnswers(run.id, run.index) : null,
  ]);
  return buildControl({ quiz, run, now, players, answered, answers });
}

/**
 * One action of the MC on the game they saw (`rev`): Lanjut's step, Jeda/Lanjutkan, Batalkan soal, Papan
 * skor sekarang. A step on an older rev (another MC was quicker, a double press) is refused with the
 * state as it is now. Opening the lobby sends "Kuis dimulai" to everyone Main WAM is on for.
 */
export async function controlAct(context: MainWamContext, quizId: string, input: { runId: string; rev: number; action: ControlAction }, now = Date.now()): Promise<{ snapshot: ControlSnapshot; message: string }> {
  await hostOnly(context, quizId);
  const { quiz, run, migrated } = await quizAndRun(quizId);
  if (!migrated) throw new ServiceError(503, "Fitur ini menunggu pembaruan sistem. Hubungi tim CoE.");
  if (!quiz || !run) throw notFound();
  if (run.id !== input.runId) throw new ServiceError(409, "Permainan ini sudah diganti di Admin WAM. Muat ulang.");
  if (run.rev !== input.rev) throw new ServiceError(409, "Sudah dilanjutkan dari layar lain. Lihat keadaan terbaru.");
  const players = await playerCount(run.id);
  const result = applyAction(flowOf(run), input.action, { now, players });
  if (!result.ok) throw new ServiceError(409, result.message);
  const saved = await saveRun(run, result.patch);
  if (saved === null) throw new ServiceError(409, "Sudah dilanjutkan dari layar lain. Lihat keadaan terbaru.");
  if (input.action === "buka-lobi") {
    // After the reply: the MC's Lanjut never waits for the bells and pushes of everyone.
    const note = () => trySendMainWamNote({
      kind: "kuis", title: "Kuis dimulai", body: `${quiz.title}: ketuk untuk ikut sebagai tokohmu.`,
      to: { audience: { type: "semua" } }, link: mainWamPath.quiz(quiz.id), by: null, tag: `kuis-${quiz.id}`,
    });
    try { after(note); } catch { await note(); }
  }
  return { snapshot: await controlState(context, quizId, Date.now()), message: "" };
}

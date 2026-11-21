import "server-only";
import { DEMO_QUIZ_ID, DEMO_QUIZ_TITLE, demoRun } from "@/lib/main-wam/kuis/demo";
import type { QuizPhase } from "@/lib/main-wam/kuis/types";
import { createPrivilegedClient } from "../../supabase/admin";
import type { MainWamContext } from "../gate";

/*
 * Beranda's cards of Kuis live (rancangan §8a): "Kuis dimulai · Ikut" for everyone while a game is open
 * (from the lobby to the podium), and "Kendalikan kuis" for its pengendali (and Admin WAM) from the
 * moment the game is made. Nothing while the module is off, before the migration, or on any failure
 * (Beranda never breaks for a card). At most three queries, only when a game is on.
 */

export type HomeQuiz = { quizId: string; title: string; phase: QuizPhase; joined: boolean; host: boolean };

/** Mode demo: when no real game is on, the sample quiz (it plays itself, src/lib/main-wam/kuis/demo.ts) is on Beranda for testers. */
export async function quizzesForHome(context: MainWamContext): Promise<HomeQuiz[]> {
  const real = await realQuizzesForHome(context);
  if (real.length || !context.settings.moduleConfig?.demo || !context.settings.modules.kuis) return real;
  return [{ quizId: DEMO_QUIZ_ID, title: DEMO_QUIZ_TITLE, phase: demoRun(Date.now()).phase, joined: true, host: false }];
}

async function realQuizzesForHome(context: MainWamContext): Promise<HomeQuiz[]> {
  if (!context.settings.modules.kuis) return [];
  try {
    const db = createPrivilegedClient();
    const { data, error } = await db.from("mw_quiz_runs").select("id,quiz_id,phase,mw_quizzes(title)").neq("phase", "selesai").order("created_at", { ascending: false }).limit(10);
    if (error || !data?.length) return [];
    const runs = data as unknown as { id: string; quiz_id: string; phase: QuizPhase; mw_quizzes: { title: string } | { title: string }[] | null }[];
    const admin = context.viewer.roles.includes("admin");
    const [hosts, joined] = await Promise.all([
      admin ? null : db.from("mw_quiz_hosts").select("quiz_id").eq("employee_id", context.viewer.id).in("quiz_id", runs.map(run => run.quiz_id)),
      db.from("mw_quiz_players").select("run_id").eq("employee_id", context.viewer.id).in("run_id", runs.map(run => run.id)),
    ]);
    const hosting = new Set(((hosts?.data ?? []) as { quiz_id: string }[]).map(row => row.quiz_id));
    const inGame = new Set(((joined.data ?? []) as { run_id: string }[]).map(row => row.run_id));
    return runs.map(run => {
      const quiz = Array.isArray(run.mw_quizzes) ? run.mw_quizzes[0] : run.mw_quizzes;
      return { quizId: run.quiz_id, title: quiz?.title ?? "Kuis live", phase: run.phase, joined: inGame.has(run.id), host: admin || hosting.has(run.quiz_id) };
    }).filter(item => item.host || item.phase !== "siap");
  } catch {
    return [];
  }
}

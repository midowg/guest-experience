import { soalTimes } from "./flow";
import { buildPlay, needsAnswers, tallyRange } from "./snapshot";
import { SAMPLE_ME, SAMPLE_PLAYERS, SAMPLE_QUESTIONS, sampleAlias, sampleAnswers, sampleTallies } from "./sample";
import type { MineRow, PlaySnapshot, QuizRun } from "./types";

/*
 * Mode demo's Kuis live (docs/main-wam/KONTRAK.md §12, rancangan-kuis-wam.md): a sample quiz of three
 * questions that plays itself in a loop for whoever opens it, so the app can be tried before the event
 * without a game running. Pure and stateless: where the loop is follows the clock, and the phone is
 * "me" (the first tokoh) who answers each question right after about four seconds. Taps are not
 * stored (the server answers with the demo's friendly refusal). Never used for a real game.
 */

/** The sample quiz's id (not the id sample.ts gives its game's quiz: tests use that one for real rows). */
export const DEMO_QUIZ_ID = "00000000-0000-4000-a000-0000000000d0";
export const DEMO_QUIZ_TITLE = "Kuis contoh WAM";
export const DEMO_QUESTIONS = SAMPLE_QUESTIONS.slice(0, 3);

const LOBBY_MS = 8_000;
const HOLD_MS = 5_000;
const BOARD_MS = 8_000;
const PODIUM_MS = 12_000;

type Step = { phase: QuizRun["phase"]; index: number; ms: number };

/** The loop: lobby, each question (to its answer and a hold), the scoreboard, the podium. */
function steps(): Step[] {
  const list: Step[] = [{ phase: "lobi", index: -1, ms: LOBBY_MS }];
  DEMO_QUESTIONS.forEach((question, index) => list.push({ phase: "soal", index, ms: soalTimes(question.level).light + HOLD_MS }));
  list.push({ phase: "skor", index: DEMO_QUESTIONS.length - 1, ms: BOARD_MS }, { phase: "podium", index: DEMO_QUESTIONS.length - 1, ms: PODIUM_MS });
  return list;
}
const LOOP = steps();
export const DEMO_LOOP_MS = LOOP.reduce((sum, step) => sum + step.ms, 0);

/** The sample game at `now`: the step the loop is in, begun at its own start. */
export function demoRun(now: number): QuizRun {
  const t = ((now % DEMO_LOOP_MS) + DEMO_LOOP_MS) % DEMO_LOOP_MS;
  const loopStart = now - t;
  let from = 0;
  for (let n = 0; n < LOOP.length; n += 1) {
    const step = LOOP[n];
    if (t < from + step.ms) {
      return {
        id: "00000000-0000-4000-a000-000000000001", quizId: DEMO_QUIZ_ID, number: 1, phase: step.phase, index: step.index, questions: DEMO_QUESTIONS,
        phaseAt: loopStart + from, pauses: [], canceled: [], boards: step.phase === "skor" || step.phase === "podium" ? [DEMO_QUESTIONS.length - 1] : [],
        podiumRevealed: step.phase === "podium" ? Math.min(3, Math.floor((t - from) / 3_500)) : 0, rev: n + 1 + Math.floor(loopStart / DEMO_LOOP_MS) * 100, endedAt: null,
      };
    }
    from += step.ms;
  }
  throw new Error("unreachable");
}

/** A phone's snapshot of the sample game ("me" is the first sample tokoh, already in the game). */
export function demoPlay(now: number, version: string | null = null): PlaySnapshot {
  const run = demoRun(now);
  const quiz = { id: DEMO_QUIZ_ID, title: DEMO_QUIZ_TITLE };
  const answers = DEMO_QUESTIONS.flatMap((_, index) => sampleAnswers(index).filter(answer => answer.employeeId === SAMPLE_ME && index <= run.index));
  const mine: MineRow = { alias: sampleAlias(0), joinedAt: run.phaseAt - 60_000, answers };
  const range = tallyRange(run, now);
  const snap = buildPlay({
    quiz, run, now, players: SAMPLE_PLAYERS, mine, employeeId: SAMPLE_ME,
    tallies: range ? sampleTallies(range.upto, range.prev).slice(0, SAMPLE_PLAYERS) : null,
    answers: needsAnswers(run, now) ? sampleAnswers(run.index) : null,
  });
  return version !== null && version === snap.v ? { serverNow: now, v: snap.v, same: true, quiz, run: null, question: null, lobby: run.phase === "lobi" ? { players: SAMPLE_PLAYERS } : null, me: null, spread: null, board: null, final: null, remaining: 0 } : snap;
}

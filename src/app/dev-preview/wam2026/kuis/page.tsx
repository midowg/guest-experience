import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
import { LangProvider } from "@/components/main-wam/i18n";
import { BigScreen } from "@/components/main-wam/kuis/BigScreen";
import { ControlScreen } from "@/components/main-wam/kuis/ControlScreen";
import { PlayScreen } from "@/components/main-wam/kuis/PlayScreen";
import { MainWamShell } from "@/components/main-wam/shell";
import { MainWamTheme } from "@/components/main-wam/theme";
import type { Lang } from "@/lib/main-wam/i18n";
import { PODIUM_DONE_AT, PODIUM_LAND_AT, PODIUM_SPIN_AT, soalTimes } from "@/lib/main-wam/kuis/flow";
import { correctPoints } from "@/lib/main-wam/kuis/rules";
import { SAMPLE_ME, SAMPLE_NAMES, SAMPLE_PLAYERS, SAMPLE_QUESTIONS, SAMPLE_T0, sampleAlias, sampleAnswers, sampleRun, sampleTallies } from "@/lib/main-wam/kuis/sample";
import { buildControl, buildPlay, buildScreen, openWinnerIds } from "@/lib/main-wam/kuis/snapshot";
import type { AnswerRow, MineRow, QuizPhase, QuizRun } from "@/lib/main-wam/kuis/types";
import { mainWamScreen } from "@/lib/main-wam/screen";
import { mainWamPath } from "@/lib/routes";

export const dynamic = "force-dynamic";

/*
 * Kuis live with sample data, no sign-in, 404 in production (KONTRAK §7): the phone (?layar=hp-…), the MC's
 * control (?layar=kendali-…) and the big screen (?layar=layar-…), each frozen at one moment of the game.
 * ?mode=dark for the phone and the control (light by default); ?mode=light for the big screen (dark by
 * default, as /kuis/{kunci}); ?lang=en for the phone.
 */

const QUIZ = { id: "00000000-0000-4000-a000-0000000000aa", title: "Kuis WAM 2026" };
const NOW = SAMPLE_T0 + 3_600_000;

type Moment = { phase: QuizPhase; index: number; at: number; mine?: { choice: number; ms: number } | null; patch?: Partial<QuizRun>; joined?: boolean };
const t2 = soalTimes(SAMPLE_QUESTIONS[2].level);
const MOMENTS: Record<string, Moment> = {
  tutup: { phase: "siap", index: -1, at: 0 },
  ikut: { phase: "lobi", index: -1, at: 20_000, joined: false },
  lobi: { phase: "lobi", index: -1, at: 20_000 },
  bersiap: { phase: "bersiap", index: 2, at: 2_000 },
  hitung: { phase: "soal", index: 2, at: 1_200, mine: null },
  jalan: { phase: "soal", index: 2, at: t2.open + 6_300, mine: null },
  "lima-detik": { phase: "soal", index: 2, at: t2.close - 3_400, mine: null },
  terkunci: { phase: "soal", index: 2, at: t2.open + 9_000, mine: { choice: SAMPLE_QUESTIONS[2].correct, ms: 6_300 } },
  habis: { phase: "soal", index: 2, at: t2.close + 800, mine: { choice: SAMPLE_QUESTIONS[2].correct, ms: 6_300 } },
  sebaran: { phase: "soal", index: 2, at: t2.reveal + 700, mine: { choice: SAMPLE_QUESTIONS[2].correct, ms: 6_300 } },
  benar: { phase: "soal", index: 2, at: t2.light + 1_500, mine: { choice: SAMPLE_QUESTIONS[2].correct, ms: 6_300 } },
  salah: { phase: "soal", index: 2, at: t2.light + 1_500, mine: { choice: 1, ms: 4_000 } },
  kosong: { phase: "soal", index: 2, at: t2.light + 1_500, mine: null },
  jeda: { phase: "soal", index: 2, at: t2.open + 6_300, mine: null, patch: { pauses: [{ from: NOW - 4_000, to: null }] } },
  batal: { phase: "batal", index: 2, at: 4_000 },
  skor: { phase: "skor", index: 3, at: 5_000 },
  podium: { phase: "podium", index: 7, at: PODIUM_DONE_AT + 500, patch: { podiumRevealed: 2 } },
  "podium-tokoh": { phase: "podium", index: 7, at: 1_600, patch: { podiumRevealed: 3 } },
  "podium-putar": { phase: "podium", index: 7, at: PODIUM_SPIN_AT + 1_300, patch: { podiumRevealed: 3 } },
  juara: { phase: "podium", index: 7, at: PODIUM_LAND_AT + 400, patch: { podiumRevealed: 3 } },
  akhir: { phase: "selesai", index: 7, at: 30_000, patch: { podiumRevealed: 3 } },
};

function runAt(moment: Moment): QuizRun {
  const boards = moment.phase === "skor" ? [1, 3] : moment.index > 3 ? [1, 3, 5] : moment.index > 1 ? [1] : [];
  return sampleRun({ phase: moment.phase, index: moment.index, phaseAt: NOW - moment.at, rev: 7, boards, ...moment.patch });
}

/** "Me" (player 0): right answers before this question, and the one of this moment. */
function mineAt(moment: Moment, winner: boolean): MineRow {
  const upto = moment.phase === "podium" || moment.phase === "selesai" ? SAMPLE_QUESTIONS.length : moment.index;
  const answers: AnswerRow[] = Array.from({ length: Math.max(0, upto) }, (_, index) => sampleAnswers(index).find(answer => answer.employeeId === SAMPLE_ME)).filter((answer): answer is AnswerRow => !!answer);
  if (moment.phase === "soal" && moment.mine) {
    const question = SAMPLE_QUESTIONS[moment.index];
    const correct = moment.mine.choice === question.correct;
    answers.push({ employeeId: SAMPLE_ME, index: moment.index, choice: moment.mine.choice, ms: moment.mine.ms, correct, points: correct ? correctPoints(moment.mine.ms, soalTimes(question.level).durMs) : -100, tappedAt: NOW });
  }
  void winner;
  return { alias: sampleAlias(0), joinedAt: SAMPLE_T0, answers };
}

const tallyFor = (run: QuizRun) => run.phase === "skor" ? sampleTallies(run.index, run.boards[run.boards.length - 2] ?? -1)
  : run.phase === "podium" || run.phase === "selesai" ? sampleTallies(SAMPLE_QUESTIONS.length - 1, -1)
    : run.phase === "soal" ? sampleTallies(run.index, run.index - 1) : null;
const answersFor = (run: QuizRun, moment: Moment) => {
  if (run.phase !== "soal") return null;
  const mine = moment.mine ?? null;
  return sampleAnswers(run.index, SAMPLE_PLAYERS, mine);
};

function Frame({ path, mode, lang, peran, children }: { path: string; mode: "light" | "dark"; lang: Lang; peran?: string; children: ReactNode }) {
  return <MainWamTheme mode={mode}><LangProvider lang={lang}>
    <MainWamShell screen={mainWamScreen(path, lang)} unread={0} committee={peran === "panitia"} greeting={{ kicker: "Selamat malam", name: "Rani" }}>{children}</MainWamShell>
  </LangProvider></MainWamTheme>;
}

export default async function DevMainWamKuis({ searchParams }: { searchParams: Promise<{ layar?: string; mode?: string; lang?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const [surface, ...rest] = (params.layar ?? "hp-jalan").split("-");
  const key = rest.join("-") || "jalan";
  const moment = MOMENTS[key] ?? MOMENTS.jalan;
  const mode = params.mode === "dark" ? "dark" : "light";
  const lang = previewLang(params);
  const run = runAt(moment);
  const tallies = tallyFor(run);
  const players = tallies?.length ?? SAMPLE_PLAYERS;
  const answers = answersFor(run, moment);
  const runOrNone = moment.phase === "siap" && key === "tutup" && surface === "hp" ? null : run;

  if (surface === "layar") {
    const names = new Map((tallies ?? []).map((row, i) => [row.employeeId, SAMPLE_NAMES[i % SAMPLE_NAMES.length]]));
    const open = tallies && (run.phase === "podium" || run.phase === "selesai") ? new Set(openWinnerIds(run, tallies, players)) : new Set<string>();
    const snap = buildScreen({
      title: QUIZ.title, run, now: NOW, players, joined: run.phase === "lobi" ? Array.from({ length: 38 }, (_, i) => sampleAlias(i)) : null,
      answered: run.phase === "soal" ? 21 : null, tallies, answers, names: new Map([...names].filter(([id]) => open.has(id))),
    });
    return <MainWamTheme mode={params.mode === "light" ? "light" : "dark"}><BigScreen initial={snap} feedUrl="" preview={{ now: NOW }} /></MainWamTheme>;
  }
  if (surface === "kendali") {
    const snap = buildControl({ quiz: QUIZ, run: runOrNone, now: NOW, players, answered: run.phase === "soal" ? 21 : null, answers });
    return <Frame path={mainWamPath.quizControl(QUIZ.id)} mode={mode} lang="id" peran="panitia"><ControlScreen quizId={QUIZ.id} initial={snap} preview={{ now: NOW }} /></Frame>;
  }
  const winner = key === "juara";
  const snap = buildPlay({ quiz: QUIZ, run: runOrNone, now: NOW, players, mine: moment.joined === false ? null : mineAt(moment, winner), employeeId: SAMPLE_ME, tallies, answers });
  // The sample's "me" wins on the gold screen: put them first.
  if (winner && snap.final) snap.final = { ...snap.final, rank: 1, winner: true };
  if (snap.run && winner) snap.run = { ...snap.run, winners: 3 };
  // The end of someone who did not win.
  if (key === "akhir" && snap.final) snap.final = { ...snap.final, rank: 12, winner: false };
  const lock = moment.mine && moment.phase === "soal" ? { choice: moment.mine.choice, value: correctPoints(moment.mine.ms, soalTimes(SAMPLE_QUESTIONS[moment.index].level).durMs) } : undefined;
  return <Frame path={mainWamPath.quiz(QUIZ.id)} mode={mode} lang={lang}><PlayScreen quizId={QUIZ.id} initial={snap} preview={{ now: NOW, lock }} /></Frame>;
}

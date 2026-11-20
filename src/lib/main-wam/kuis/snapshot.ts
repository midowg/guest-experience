import { answerOpen, podiumPlaceOpen, publicUpto, snapshotVersion, soalTimes, winnersOf } from "./flow";
import { captionsOf, correctPoints, countChoices, percents, rankTallies, streakOf, totalOf } from "./rules";
import type {
  Alias, AnswerRow, BoardRow, Caption, ControlSnapshot, Fastest, MeView, MineRow, MyBoard, MyFinal, PlaySnapshot, PodiumEntry, QuestionView,
  QuizRef, QuizRun, RunView, ScreenSnapshot, Spread, TallyRow,
} from "./types";

/*
 * What each screen gets, built from the rows the server read (pure, so the privacy rules are tested
 * without a database, snapshot.test.ts):
 *   - the key of a question, the spread and the scores of a question leave only once its answer opens
 *     (answerOpen: close + 2 s by the server's clock); before that a phone knows its own choice and the
 *     value it locked, never right or wrong;
 *   - players are their tokoh (Alias); a name only on the big screen's podium, for a place the MC has
 *     opened (and on the winner's own phone, as "Kamu");
 *   - a phone gets its own place and its neighbours, never the whole list.
 */

export function runView(run: QuizRun, players: number): RunView {
  return {
    id: run.id, number: run.number, phase: run.phase, index: run.index, count: run.questions.length, levels: run.questions.map(question => question.level),
    phaseAt: run.phaseAt, pauses: run.pauses, canceled: run.canceled, boards: run.boards, podiumRevealed: run.podiumRevealed, winners: winnersOf(players), rev: run.rev,
  };
}

/** The flow's view of a run (what flow.ts reads). */
export const flowOf = (run: QuizRun) => ({ ...run, levels: run.questions.map(question => question.level) });

/** The question in play: during a question (and its cancel), the key only once the answer is open. */
export function questionView(run: QuizRun, now: number): QuestionView | null {
  if (run.phase !== "soal" && run.phase !== "batal") return null;
  const question = run.questions[run.index];
  if (!question) return null;
  const open = answerOpen(flowOf(run), now);
  return { index: run.index, level: question.level, body: question.body, options: [...question.options], correct: open ? question.correct : null };
}

/** How the answers fell, once open. */
export function spreadOf(answers: readonly Pick<AnswerRow, "choice">[], players: number): Spread {
  const counts = countChoices(answers.map(answer => answer.choice));
  const answered = counts.reduce((sum, count) => sum + count, 0);
  return { counts, percents: percents(counts), answered, none: Math.max(0, players - answered) };
}

type Ranked = TallyRow & { rank: number };
const ranked = (tallies: readonly TallyRow[]) => rankTallies(tallies.map(row => ({ ...row, key: row.employeeId })));
const rankedBefore = (tallies: readonly TallyRow[]) => rankTallies(tallies.map(row => ({ ...row, key: row.employeeId, total: row.prevTotal, correctMs: row.prevCorrectMs, lastCorrectAt: row.prevLastCorrectAt })));

/**
 * Which totals a screen needs at `now` (the server reads mw_quiz_board with these): up to the last open
 * question, and up to the one to compare with (the question before, or the scoreboard before). null: none
 * (before an answer opens nobody's place is shown, so nothing is read).
 */
export function tallyRange(run: QuizRun, now: number): { upto: number; prev: number } | null {
  const flow = flowOf(run);
  switch (run.phase) {
    case "soal": return answerOpen(flow, now) ? { upto: run.index, prev: run.index - 1 } : null;
    case "skor": return { upto: run.index, prev: run.boards.length > 1 ? run.boards[run.boards.length - 2] : -1 };
    case "podium": case "selesai": return { upto: run.questions.length - 1, prev: -1 };
    default: return null;
  }
}

/** Whether a screen needs the answers to the question in play (its spread): only once it is open. */
export const needsAnswers = (run: QuizRun, now: number) => run.phase === "soal" && answerOpen(flowOf(run), now);

/* ── A player's phone ───────────────────────────────────────────────────────────────────────────── */

export type PlayInput = {
  quiz: QuizRef;
  run: QuizRun | null;
  now: number;
  players: number;
  /** The viewer's row and answers; null = not joined. */
  mine: MineRow | null;
  employeeId: string;
  /** Everyone's totals (only where the screen shows places: an open answer, the scoreboard, the end). */
  tallies: readonly TallyRow[] | null;
  /** The answers to the question in play, once open (the spread). */
  answers: readonly AnswerRow[] | null;
};

export function buildPlay(input: PlayInput): PlaySnapshot {
  const { quiz, run, now, players, mine, tallies } = input;
  const base: PlaySnapshot = { serverNow: now, v: snapshotVersion(run ? flowOf(run) : null, now), quiz, run: null, question: null, lobby: null, me: null, spread: null, board: null, final: null, remaining: 0 };
  if (!run) return base;
  const flow = flowOf(run);
  const upto = publicUpto(flow, now);
  const open = answerOpen(flow, now);
  const view = runView(run, players);
  const out: PlaySnapshot = {
    ...base, run: view, question: questionView(run, now), lobby: run.phase === "lobi" ? { players } : null,
    remaining: run.index >= 0 ? Math.max(0, run.questions.length - 1 - run.index) : run.questions.length,
  };
  if (open && input.answers) out.spread = spreadOf(input.answers, players);
  if (!mine) return out;

  const shown = mine.answers.filter(answer => answer.index <= upto && !run.canceled.includes(answer.index));
  const current = (run.phase === "soal" || run.phase === "batal") ? mine.answers.find(answer => answer.index === run.index) ?? null : null;
  const question = run.questions[run.index];
  const order = tallies ? ranked(tallies) : null;
  const before = tallies ? rankedBefore(tallies) : null;
  const placeOf = (list: Ranked[] | null) => list?.find(row => row.employeeId === input.employeeId)?.rank ?? null;
  const me: MeView = {
    alias: mine.alias,
    answer: current && question ? { choice: current.choice, value: correctPoints(current.ms, soalTimes(question.level).durMs) } : null,
    result: current && open ? { correct: current.correct, points: current.points } : null,
    total: totalOf(shown, run.canceled),
    rank: placeOf(order),
    rankBefore: placeOf(before),
    players,
    streak: streakOf(shown, upto, run.canceled),
  };
  out.me = me;
  if (run.phase === "skor" && order) out.board = myBoard(order, before, input.employeeId, run.boards.length > 1);
  if ((run.phase === "podium" || run.phase === "selesai") && order) out.final = myFinal(order, input.employeeId, players);
  return out;
}

function myBoard(order: Ranked[], before: Ranked[] | null, employeeId: string, hadBoard: boolean): MyBoard | null {
  const row = order.find(item => item.employeeId === employeeId);
  if (!row) return null;
  const above = row.rank > 1 ? order[row.rank - 2] : null;
  const from = Math.max(0, Math.min(row.rank - 2, order.length - 3));
  return {
    rank: row.rank, players: order.length, total: row.total,
    prevRank: hadBoard ? before?.find(item => item.employeeId === employeeId)?.rank ?? null : null,
    gap: above ? { rank: above.rank, points: above.total - row.total } : null,
    lead: row.rank === 1 && order[1] ? row.total - order[1].total : null,
    neighbors: order.slice(from, from + 3).map(item => ({ rank: item.rank, alias: item.alias, total: item.total, me: item.employeeId === employeeId })),
  };
}

function myFinal(order: Ranked[], employeeId: string, players: number): MyFinal | null {
  const row = order.find(item => item.employeeId === employeeId);
  if (!row) return null;
  return { rank: row.rank, total: row.total, correct: row.correct, players: order.length, winner: row.rank <= winnersOf(players) };
}

/* ── The MC's control ───────────────────────────────────────────────────────────────────────────── */

export function buildControl(input: { quiz: QuizRef; run: QuizRun | null; now: number; players: number; answered: number | null; answers: readonly AnswerRow[] | null }): ControlSnapshot {
  const { quiz, run, now, players } = input;
  const base: ControlSnapshot = { serverNow: now, v: snapshotVersion(run ? flowOf(run) : null, now), quiz, run: null, players, answered: null, question: null, percentCorrect: null };
  if (!run) return base;
  const question = questionView(run, now);
  const open = answerOpen(flowOf(run), now);
  let percentCorrect: number | null = null;
  if (open && input.answers && question?.correct !== null && question) {
    const spread = spreadOf(input.answers, players);
    percentCorrect = spread.answered ? spread.percents[question.correct!] : 0;
  }
  return { ...base, run: runView(run, players), answered: run.phase === "soal" ? input.answered ?? 0 : null, question, percentCorrect };
}

/* ── The big screen ─────────────────────────────────────────────────────────────────────────────── */

export type ScreenInput = {
  title: string;
  run: QuizRun | null;
  now: number;
  players: number;
  /** The lobby's tokoh in the order they joined. */
  joined: Alias[] | null;
  answered: number | null;
  tallies: readonly TallyRow[] | null;
  answers: readonly AnswerRow[] | null;
  /** Nama panggilan of the podium's places (the server reads only the winners'). */
  names: ReadonlyMap<string, string> | null;
};

export function buildScreen(input: ScreenInput): ScreenSnapshot {
  const { run, now, players } = input;
  const base: ScreenSnapshot = {
    serverNow: now, v: snapshotVersion(run ? flowOf(run) : null, now), quiz: { title: input.title }, run: null, players, joined: null, answered: null,
    question: null, spread: null, captions: [], fastest: null, board: null, podium: null,
  };
  if (!run) return base;
  const flow = flowOf(run);
  const open = answerOpen(flow, now);
  const question = questionView(run, now);
  const out: ScreenSnapshot = { ...base, run: runView(run, players), joined: run.phase === "lobi" ? input.joined ?? [] : null, answered: run.phase === "soal" ? input.answered ?? 0 : null, question };
  if (open && input.answers && question && question.correct !== null) {
    out.spread = spreadOf(input.answers, players);
    out.captions = captionsOf(out.spread.counts, question.correct);
    out.fastest = fastestOf(input.answers, input.tallies);
  }
  if (run.phase === "skor" && input.tallies) out.board = boardRows(input.tallies, run.boards.length > 1);
  if ((run.phase === "podium" || run.phase === "selesai") && input.tallies) out.podium = podiumOf(flow, input.tallies, players, input.names);
  return out;
}

/** Tercepat: the quickest right answer, by tokoh (the name never). */
export function fastestOf(answers: readonly AnswerRow[], tallies: readonly TallyRow[] | null): Fastest | null {
  let best: AnswerRow | null = null;
  for (const answer of answers) if (answer.correct && (!best || answer.ms < best.ms || (answer.ms === best.ms && answer.tappedAt < best.tappedAt))) best = answer;
  const alias = best && tallies?.find(row => row.employeeId === best!.employeeId)?.alias;
  return best && alias ? { alias, ms: best.ms } : null;
}

/** The top 5 now, and those who were in the top 5 at the scoreboard before (they slide out). */
export function boardRows(tallies: readonly TallyRow[], hadBoard: boolean): BoardRow[] {
  const now = ranked(tallies);
  const before = hadBoard ? rankedBefore(tallies) : null;
  const top = now.slice(0, 5);
  const ids = new Set(top.map(row => row.employeeId));
  const leaving = before ? before.slice(0, 5).filter(row => !ids.has(row.employeeId)).map(row => now.find(item => item.employeeId === row.employeeId)!) : [];
  const fromOf = (employeeId: string) => before?.find(row => row.employeeId === employeeId) ?? null;
  // The row's key is its place in this list, not who it is (nothing on the big screen names anyone).
  return [...top, ...leaving].map((row, index) => {
    const from = fromOf(row.employeeId);
    return { key: `r${index}`, rank: row.rank, fromRank: from?.rank ?? null, alias: row.alias, total: row.total, fromTotal: from ? row.prevTotal : 0 };
  });
}

/** The winners, #1 first; the name of a place only once the MC opened it. */
export function podiumOf(flow: Parameters<typeof podiumPlaceOpen>[0], tallies: readonly TallyRow[], players: number, names: ReadonlyMap<string, string> | null): PodiumEntry[] {
  const winners = winnersOf(players);
  return ranked(tallies).slice(0, winners).map(row => ({
    rank: row.rank, alias: row.alias, total: row.total, correct: row.correct,
    name: podiumPlaceOpen(flow, winners, row.rank) ? names?.get(row.employeeId) ?? null : null,
  }));
}

/** The employee ids of the podium's open places (the only names the big screen asks for). */
export function openWinnerIds(run: QuizRun, tallies: readonly TallyRow[], players: number): string[] {
  const winners = winnersOf(players);
  return ranked(tallies).slice(0, winners).filter(row => podiumPlaceOpen(flowOf(run), winners, row.rank)).map(row => row.employeeId);
}

export type { Caption };

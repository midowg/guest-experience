/*
 * Kuis live (docs/rancangan-kuis-wam.md): the shared types of the module "kuis" of Main WAM. A quiz has
 * questions, chosen hosts (pengendali) and a big-screen link; a run (permainan) freezes the questions and
 * walks through its phases; players join a run with their tokoh as alias; answers are one per person per
 * question. Times are epoch milliseconds (the server's clock). Pure types, no server code.
 */

export const QUIZ_PHASES = ["siap", "lobi", "bersiap", "soal", "batal", "skor", "podium", "selesai"] as const;
/**
 * siap     made in Admin WAM, nobody can join yet (the big screen says "Segera dimulai").
 * lobi     open: players join (Beranda's card "Kuis dimulai · Ikut").
 * bersiap  the next question's number, with the level card when the level changes.
 * soal     a question: 3-2-1, the question runs to its end, time up, the spread, the answer (by the clock).
 * batal    the MC cancelled the question: it is not scored.
 * skor     the scoreboard after a question.
 * podium   the winners, opened one by one (#3, #2, #1).
 * selesai  over.
 */
export type QuizPhase = (typeof QUIZ_PHASES)[number];
export type QuizLevel = 1 | 2 | 3 | 4;

/** A pause of the MC (Jeda): from, and to once resumed (null while it lasts). Epoch ms. */
export type Pause = { from: number; to: number | null };

/** A question as frozen into a run. Its key (`correct`) never leaves the server before the answer opens. */
export type RunQuestion = { id: string; level: QuizLevel; body: string; options: string[]; correct: number };

/** A run as the server keeps it (mw_quiz_runs). */
export type QuizRun = {
  id: string;
  quizId: string;
  number: number;
  phase: QuizPhase;
  /** The question in play (bersiap, soal, batal, skor); -1 before the first. */
  index: number;
  questions: RunQuestion[];
  /** When the phase (or the podium's current opening) began. */
  phaseAt: number;
  /** The MC's pauses in this phase. */
  pauses: Pause[];
  canceled: number[];
  /** The questions after which a scoreboard was shown. */
  boards: number[];
  /** How many winners are open on the podium (#3 first). */
  podiumRevealed: number;
  /** Every change adds one: clients ask "anything new since rev?", hosts act on the rev they saw. */
  rev: number;
  endedAt: number | null;
};

/** What every screen knows of a run: never a key. */
export type RunView = {
  id: string;
  number: number;
  phase: QuizPhase;
  index: number;
  count: number;
  /** The level of every question, in order (the screens show "Soal 3 dari 18" and its level). */
  levels: QuizLevel[];
  phaseAt: number;
  pauses: Pause[];
  canceled: number[];
  boards: number[];
  podiumRevealed: number;
  /** How many winners the podium opens: 3, or fewer players. */
  winners: number;
  rev: number;
};

/** A player as others see them: the tokoh of their questionnaire card, or "Tokoh misterius #07". Never a name. */
export type Alias = {
  name: string;
  /** The tokoh's key (its picture is /figur/{key}.webp); null for a Tokoh misterius. */
  figure: string | null;
  /** "Ahli Siasat", or "" for a Tokoh misterius. */
  persona: string;
  /** The persona's two colours (light, dark), from the card; null for a Tokoh misterius. */
  colors: [string, string] | null;
  /** 7 for "Tokoh misterius #07"; null for a tokoh. */
  mystery: number | null;
};

/** The question on screen: the key only once the answer is open. */
export type QuestionView = { index: number; level: QuizLevel; body: string; options: string[]; correct: number | null };

/** How the answers fell (after the answer opens): per option, of those who answered. */
export type Spread = { counts: number[]; percents: number[]; answered: number; none: number };

/** A line that draws a reaction (§4a.6), chosen from the spread. */
export type Caption =
  | { kind: "semua" }
  | { kind: "hampir"; percent: number }
  | { kind: "sedikit"; percent: number }
  | { kind: "tertipu"; percent: number; option: number }
  | { kind: "kosong" };

export type Fastest = { alias: Alias; ms: number };

/** A scoreboard row on the big screen, with where it came from (the last scoreboard), for the swap. */
export type BoardRow = { key: string; rank: number; fromRank: number | null; alias: Alias; total: number; fromTotal: number };

/** A winner on the podium; the name only once the MC opened that place. */
export type PodiumEntry = { rank: number; alias: Alias; total: number; correct: number; name: string | null };

/** A player's own part (their phone). */
export type MeView = {
  alias: Alias;
  /** My answer to the question on screen: the option and the value locked (no right or wrong before it opens). */
  answer: { choice: number; value: number } | null;
  /** Once the answer opens: right or wrong, and the points. */
  result: { correct: boolean; points: number } | null;
  /** My total up to the last question whose answer is open. */
  total: number;
  /** My place after the last open question, and before it (null when not known on this screen). */
  rank: number | null;
  rankBefore: number | null;
  players: number;
  /** Right answers in a row up to the last open question (shown, never scored). */
  streak: number;
};

/** My scoreboard (phase skor). */
export type MyBoard = {
  rank: number;
  players: number;
  total: number;
  /** My place at the scoreboard before (null for the first). */
  prevRank: number | null;
  /** Points to the place above (0 = tied on points, behind on time); null for #1. */
  gap: { rank: number; points: number } | null;
  /** #1 only: points ahead of #2. */
  lead: number | null;
  neighbors: { rank: number; alias: Alias; total: number; me: boolean }[];
};

/** My end (podium, selesai). */
export type MyFinal = { rank: number; total: number; correct: number; players: number; winner: boolean };

export type QuizRef = { id: string; title: string };

/** GET of a player's phone. `same`: nothing new since `v` (the rest is then empty). */
export type PlaySnapshot = {
  serverNow: number;
  v: string;
  same?: boolean;
  quiz: QuizRef;
  run: RunView | null;
  question: QuestionView | null;
  lobby: { players: number } | null;
  /** null: not joined (yet). */
  me: MeView | null;
  spread: Spread | null;
  board: MyBoard | null;
  final: MyFinal | null;
  /** The questions left after the one on screen ("Masih ada 12 soal"). */
  remaining: number;
};

/** GET of the MC's control. */
export type ControlSnapshot = {
  serverNow: number;
  v: string;
  same?: boolean;
  quiz: QuizRef;
  run: RunView | null;
  players: number;
  /** How many answered the question in play (null outside a question). */
  answered: number | null;
  question: QuestionView | null;
  /** Once open: the share that answered right. */
  percentCorrect: number | null;
};

/** GET of the big screen. */
export type ScreenSnapshot = {
  serverNow: number;
  v: string;
  same?: boolean;
  quiz: { title: string };
  run: RunView | null;
  players: number;
  /** The lobby's tokoh, in the order they joined. */
  joined: Alias[] | null;
  answered: number | null;
  question: QuestionView | null;
  spread: Spread | null;
  captions: Caption[];
  fastest: Fastest | null;
  board: BoardRow[] | null;
  podium: PodiumEntry[] | null;
};

/* ── What the server reads (raw rows, for the pure builders in snapshot.ts) ─────────────────── */

/** A player with their totals up to a question and up to an earlier one (mw_quiz_board). */
export type TallyRow = {
  employeeId: string;
  alias: Alias;
  joinedAt: number;
  total: number;
  correct: number;
  correctMs: number;
  lastCorrectAt: number | null;
  prevTotal: number;
  prevCorrectMs: number;
  prevLastCorrectAt: number | null;
};

/** One answer as stored (mw_quiz_answers). */
export type AnswerRow = { employeeId: string; index: number; choice: number; ms: number; correct: boolean; points: number; tappedAt: number };

/** A player's own row and their answers in the run. */
export type MineRow = { alias: Alias; joinedAt: number; answers: AnswerRow[] };

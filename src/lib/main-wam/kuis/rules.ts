import type { Caption, Pause, QuizLevel } from "./types";

/*
 * Kuis live's rules (docs/rancangan-kuis-wam.md §2, §4a), pure and tested (rules.test.ts):
 *   benar  = 300 + round(200 × sisa / waktu soal)   500 when it opens, 300 just before time is up
 *   salah  = −100;  kosong = 0;  total = the sum of the answers' points (never kept apart).
 * The phone shows the value of "benar" as it falls with the time bar; a tap locks it, and that is the
 * value a right answer gets. The server accepts the phone's tap time when it is not before the
 * question opened and at most 1.5 s before it arrived (else: arrival − 1.5 s), and an answer tapped
 * before time is up when it arrives at most 2 s after. The MC's pauses do not count: answer time =
 * tap − open − the pauses before the tap. Ties: the smaller total time of right answers first, then
 * the earlier last right answer.
 */

export const LEVELS: readonly { level: QuizLevel; seconds: number }[] = [
  { level: 1, seconds: 15 },
  { level: 2, seconds: 20 },
  { level: 3, seconds: 30 },
  { level: 4, seconds: 40 },
];
/** Admin, control and big screen speak Indonesian; the phone takes its own words (i18n kuis.level.*). */
export const levelLabels: Record<QuizLevel, string> = { 1: "Mudah", 2: "Sedang", 3: "Sulit", 4: "Sangat sulit" };
export const isLevel = (value: unknown): value is QuizLevel => value === 1 || value === 2 || value === 3 || value === 4;
/** How long a question of this level runs. */
export const levelMs = (level: QuizLevel): number => (LEVELS.find(item => item.level === level)?.seconds ?? 20) * 1000;

export const MAX_POINTS = 500;
export const MIN_CORRECT_POINTS = 300;
export const WRONG_POINTS = -100;
/** "Mulai soal" opens the question this long after (3-2-1 on every screen). */
export const COUNTDOWN_MS = 3000;
/** Answers tapped in time may arrive this long after time is up; the answer opens then ("Waktu habis!" with a drum). */
export const GRACE_MS = 2000;
/** The spread shows this long before the right answer lights. */
export const SPREAD_MS = 1500;
/** A tap time the server takes as it is: at most this long before the answer arrived. */
export const TAP_SLACK_MS = 1500;
export const OPTION_COUNT = 4;
export const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

/** The value of a right answer `ms` into a question of `durMs`. */
export function correctPoints(ms: number, durMs: number): number {
  const left = Math.max(0, durMs - Math.max(0, ms));
  return MIN_CORRECT_POINTS + Math.round((200 * left) / durMs);
}

/** One answer's points: right by the formula, wrong −100, none 0. */
export function pointsOf(answer: { choice: number; ms: number } | null, correct: number, durMs: number): number {
  if (!answer) return 0;
  return answer.choice === correct ? correctPoints(answer.ms, durMs) : WRONG_POINTS;
}

/** Total = the sum of the points of the answers (canceled questions left out). */
export const totalOf = (answers: { index: number; points: number }[], canceled: readonly number[] = []): number =>
  answers.reduce((sum, answer) => (canceled.includes(answer.index) ? sum : sum + answer.points), 0);

/* ── The game clock: real time minus the MC's pauses ────────────────────────────────────────────── */

const ordered = (pauses: readonly Pause[]) => [...pauses].sort((a, b) => a.from - b.from);

/** Is the game paused at `t`? */
export const pausedAt = (pauses: readonly Pause[], t: number): boolean => pauses.some(pause => t >= pause.from && (pause.to === null || t < pause.to));
/** Is a pause going on now (the last one has no end)? */
export const isPaused = (pauses: readonly Pause[]): boolean => pauses.some(pause => pause.to === null);

/** Game time at real `t` since `start`: the time paused before `t` does not count. */
export function gameElapsed(start: number, pauses: readonly Pause[], t: number): number {
  let paused = 0;
  for (const pause of ordered(pauses)) {
    const from = Math.max(pause.from, start);
    const to = pause.to ?? Number.POSITIVE_INFINITY;
    if (t <= from || to <= from) continue;
    paused += Math.min(t, to) - from;
  }
  return Math.max(0, t - start - paused);
}

/** The real time when game time `g` is reached; null while a pause holds it back. */
export function realAt(start: number, pauses: readonly Pause[], g: number): number | null {
  let t = start;
  let elapsed = 0;
  for (const pause of ordered(pauses)) {
    const to = pause.to ?? null;
    if (to !== null && to <= t) continue;
    const from = Math.max(pause.from, t);
    if (elapsed + (from - t) >= g) return t + (g - elapsed);
    elapsed += from - t;
    if (to === null) return null;
    t = to;
  }
  return t + (g - elapsed);
}

/* ── An answer reaches the server ───────────────────────────────────────────────────────────────── */

export type AnswerVerdict =
  | { ok: true; ms: number; tapAt: number }
  /** belum: the question has not opened; habis: time is up (or it came too late); jeda: tapped during a pause. */
  | { ok: false; reason: "belum" | "habis" | "jeda" };

/**
 * Whether an answer counts, and its answer time. `phaseAt` is when "Mulai soal" was pressed (the question
 * opens COUNTDOWN_MS of game time later), `pauses` the MC's pauses since, `tapAt` the phone's tap on the
 * server's clock (its own estimate), `recvAt` when it arrived.
 */
export function judgeAnswer(input: { phaseAt: number; pauses: readonly Pause[]; durMs: number; tapAt: number; recvAt: number }): AnswerVerdict {
  const { phaseAt, pauses, durMs, recvAt } = input;
  const arrived = gameElapsed(phaseAt, pauses, recvAt);
  if (arrived < COUNTDOWN_MS) return { ok: false, reason: "belum" };
  if (arrived >= COUNTDOWN_MS + durMs + GRACE_MS) return { ok: false, reason: "habis" };
  const openedAt = realAt(phaseAt, pauses, COUNTDOWN_MS) ?? recvAt;
  const closedAt = realAt(phaseAt, pauses, COUNTDOWN_MS + durMs);
  const claimed = Number.isFinite(input.tapAt) ? input.tapAt : recvAt;
  // Tapped (by the phone's word) once time was up: too late, whenever it arrives.
  if (closedAt !== null && claimed >= closedAt) return { ok: false, reason: "habis" };
  const fair = claimed >= openedAt && claimed <= recvAt && recvAt - claimed <= TAP_SLACK_MS;
  if (fair && pausedAt(pauses, claimed)) return { ok: false, reason: "jeda" };
  const used = fair ? claimed : Math.max(openedAt, recvAt - TAP_SLACK_MS);
  // A slow answer (more than 1.5 s on the way) taken at arrival − 1.5 s may land after the close: the lowest right value.
  const ms = Math.min(durMs, Math.max(0, Math.round(gameElapsed(phaseAt, pauses, used) - COUNTDOWN_MS)));
  return { ok: true, ms, tapAt: used };
}

/* ── Standings ──────────────────────────────────────────────────────────────────────────────────── */

export type Tally = { key: string; total: number; correctMs: number; lastCorrectAt: number | null; joinedAt: number };

/** Higher total first; a tie: the smaller total time of right answers, then the earlier last right answer, then who joined first. */
export function compareTally(a: Tally, b: Tally): number {
  if (a.total !== b.total) return b.total - a.total;
  if (a.correctMs !== b.correctMs) return a.correctMs - b.correctMs;
  const lastA = a.lastCorrectAt ?? Number.POSITIVE_INFINITY;
  const lastB = b.lastCorrectAt ?? Number.POSITIVE_INFINITY;
  if (lastA !== lastB) return lastA < lastB ? -1 : 1;
  if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Everyone in order with their place, 1 … n (the tie rules leave no two on one place). */
export function rankTallies<T extends Tally>(rows: readonly T[]): (T & { rank: number })[] {
  return [...rows].sort(compareTally).map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Right answers in a row, counting back from `upto` (canceled questions skipped, a question not answered breaks it). */
export function streakOf(answers: readonly { index: number; correct: boolean }[], upto: number, canceled: readonly number[] = []): number {
  const byIndex = new Map(answers.map(answer => [answer.index, answer]));
  let streak = 0;
  for (let index = upto; index >= 0; index -= 1) {
    if (canceled.includes(index)) continue;
    if (byIndex.get(index)?.correct) streak += 1;
    else break;
  }
  return streak;
}

/* ── The spread and its captions (§4a) ──────────────────────────────────────────────────────────── */

/** Percents of those who answered, whole numbers that add up to 100 (largest remainder). */
export function percents(counts: readonly number[]): number[] {
  const answered = counts.reduce((sum, count) => sum + count, 0);
  if (!answered) return counts.map(() => 0);
  const raw = counts.map(count => (count * 100) / answered);
  const out = raw.map(Math.floor);
  let rest = 100 - out.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => [value - out[index], index] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, index] of order) {
    if (rest <= 0) break;
    if (counts[index] > 0) { out[index] += 1; rest -= 1; }
  }
  return out;
}

/** The counts per option of a list of choices. */
export const countChoices = (choices: readonly number[]): number[] => {
  const counts = Array.from({ length: OPTION_COUNT }, () => 0);
  for (const choice of choices) if (choice >= 0 && choice < OPTION_COUNT) counts[choice] += 1;
  return counts;
};

/**
 * The lines the big screen shows once the answer opens, strongest first: everyone right (confetti),
 * or ≥ 90 % right; ≤ 15 % right; the most chosen option was wrong ("64% tertipu pilihan B").
 */
export function captionsOf(counts: readonly number[], correct: number): Caption[] {
  const answered = counts.reduce((sum, count) => sum + count, 0);
  if (!answered) return [{ kind: "kosong" }];
  const shares = percents(counts);
  const out: Caption[] = [];
  if (counts[correct] === answered) out.push({ kind: "semua" });
  else if (shares[correct] >= 90) out.push({ kind: "hampir", percent: shares[correct] });
  if (shares[correct] <= 15) out.push({ kind: "sedikit", percent: shares[correct] });
  let top = 0;
  counts.forEach((count, index) => { if (count > counts[top]) top = index; });
  if (top !== correct && counts[top] > counts[correct]) out.push({ kind: "tertipu", percent: shares[top], option: top });
  return out;
}

/** The big screen's words for a caption (Indonesian, with the show's exclamation, §4a.6). */
export function captionText(caption: Caption): string {
  switch (caption.kind) {
    case "semua": return "Semua benar!";
    case "hampir": return "Hampir semua benar!";
    case "sedikit": return `Hanya ${caption.percent}% yang benar!`;
    case "tertipu": return `${caption.percent}% tertipu pilihan ${OPTION_LETTERS[caption.option]}`;
    case "kosong": return "Tidak ada yang menjawab";
  }
}

/** "1,2" seconds. */
export const secondsText = (ms: number): string => (Math.max(0, ms) / 1000).toFixed(1).replace(".", ",");

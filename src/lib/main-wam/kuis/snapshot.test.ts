import { describe, expect, it } from "vitest";
import { PODIUM_DONE_AT, soalTimes } from "./flow";
import { SAMPLE_ME, SAMPLE_PLAYERS, SAMPLE_QUESTIONS, SAMPLE_T0, sampleAlias, sampleAnswers, sampleEmployee, sampleRun, sampleTallies } from "./sample";
import { boardRows, buildControl, buildPlay, buildScreen, fastestOf, openWinnerIds, questionView, tallyRange } from "./snapshot";
import type { MineRow } from "./types";

/*
 * What leaves the server (rancangan §3, §4a.7, §6): the key and the scores only once the answer opens;
 * players by tokoh; names only on the big screen's podium for a place the MC opened.
 */

const quiz = { id: "00000000-0000-4000-a000-0000000000aa", title: "Kuis WAM" };
const index = 2; // Sedang, 20 s
const times = soalTimes(2);
const soal = sampleRun({ phase: "soal", index, phaseAt: SAMPLE_T0, rev: 9 });
const mine = (answers = [0, 1, 2].flatMap(i => sampleAnswers(i).filter(answer => answer.employeeId === SAMPLE_ME))): MineRow => ({ alias: sampleAlias(0), joinedAt: SAMPLE_T0 - 60_000, answers });
const play = (now: number, patch: Partial<Parameters<typeof buildPlay>[0]> = {}) => buildPlay({
  quiz, run: soal, now, players: SAMPLE_PLAYERS, mine: mine(), employeeId: SAMPLE_ME, tallies: null, answers: null, ...patch,
});
const ids = Array.from({ length: SAMPLE_PLAYERS }, (_, i) => sampleEmployee(i));
const noIds = (value: unknown) => ids.every(id => !JSON.stringify(value).includes(id));

describe("a phone during a question", () => {
  const running = SAMPLE_T0 + times.open + 6_000;
  it("gets the question without its key, its own lock without right or wrong, and its total before this question", () => {
    const snap = play(running);
    expect(snap.question).toMatchObject({ index, options: SAMPLE_QUESTIONS[index].options, correct: null });
    expect(snap.question).not.toHaveProperty("body");
    expect(JSON.stringify(snap)).not.toContain(SAMPLE_QUESTIONS[index].body);
    expect(snap.me?.answer).toEqual({ choice: SAMPLE_QUESTIONS[index].correct, value: 458 });
    expect(snap.me?.result).toBeNull();
    const before = [0, 1].flatMap(i => sampleAnswers(i)).filter(answer => answer.employeeId === SAMPLE_ME).reduce((sum, answer) => sum + answer.points, 0);
    expect(snap.me?.total).toBe(before);
    expect(snap.spread).toBeNull();
    expect(snap.v).toBe(`${soal.id}.9.0`);
    expect(JSON.stringify(snap)).not.toMatch(/"points"|"correct":(true|false|\d)/);
  });

  it("asks for nobody's totals or answers before it opens", () => {
    expect(tallyRange(soal, SAMPLE_T0 + times.reveal - 1)).toBeNull();
    expect(tallyRange(soal, SAMPLE_T0 + times.reveal)).toEqual({ upto: index, prev: index - 1 });
    expect(questionView(soal, SAMPLE_T0 + times.reveal - 1)?.correct).toBeNull();
    expect(questionView(soal, SAMPLE_T0 + times.reveal)?.correct).toBe(SAMPLE_QUESTIONS[index].correct);
  });

  it("gets the key, the spread, its result and its places at close + 2 s", () => {
    const open = SAMPLE_T0 + times.reveal;
    const snap = play(open, { tallies: sampleTallies(index, index - 1), answers: sampleAnswers(index) });
    expect(snap.question?.correct).toBe(SAMPLE_QUESTIONS[index].correct);
    expect(snap.me?.result).toEqual({ correct: true, points: 458 });
    expect(snap.me?.rank).toBeGreaterThan(0);
    expect(snap.me?.rankBefore).toBeGreaterThan(0);
    expect(snap.me?.streak).toBe(3);
    expect(snap.spread?.answered).toBe(sampleAnswers(index).length);
    expect(snap.spread?.percents.reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(snap.spread?.none).toBe(SAMPLE_PLAYERS - sampleAnswers(index).length);
    expect(snap.v).toBe(`${soal.id}.9.1`);
    expect(noIds(snap)).toBe(true);
  });

  it("shows a phone that has not joined the question but no own part", () => {
    const snap = play(running, { mine: null });
    expect(snap.me).toBeNull();
    expect(snap.question?.correct).toBeNull();
  });
});

describe("a phone at the scoreboard and the end", () => {
  it("gets its own place, the gap to the one above, and three neighbours by tokoh", () => {
    const skor = sampleRun({ phase: "skor", index: 3, boards: [1, 3], phaseAt: SAMPLE_T0 });
    const snap = buildPlay({ quiz, run: skor, now: SAMPLE_T0 + 1_000, players: SAMPLE_PLAYERS, mine: mine(), employeeId: SAMPLE_ME, tallies: sampleTallies(3, 1), answers: null });
    expect(snap.board?.neighbors).toHaveLength(3);
    expect(snap.board?.neighbors.filter(row => row.me)).toHaveLength(1);
    expect(snap.board?.prevRank).toBeGreaterThan(0);
    if (snap.board!.rank > 1) expect(snap.board?.gap?.rank).toBe(snap.board!.rank - 1);
    expect(noIds(snap)).toBe(true);
    expect(tallyRange(skor, SAMPLE_T0)).toEqual({ upto: 3, prev: 1 });
  });

  it("gets its final place; never anyone's name", () => {
    const podium = sampleRun({ phase: "podium", index: 7, podiumRevealed: 3, phaseAt: SAMPLE_T0 });
    const snap = buildPlay({ quiz, run: podium, now: SAMPLE_T0 + PODIUM_DONE_AT, players: SAMPLE_PLAYERS, mine: mine(), employeeId: SAMPLE_ME, tallies: sampleTallies(7, -1), answers: null });
    expect(snap.final).toMatchObject({ players: SAMPLE_PLAYERS });
    expect(JSON.stringify(snap)).not.toMatch(/Rani|Sari|Bima/);
  });
});

describe("the big screen", () => {
  it("counts answers during a question, and gets the spread, captions and the quickest tokoh once open", () => {
    const running = buildScreen({ title: "Kuis", run: soal, now: SAMPLE_T0 + times.open + 6_000, players: SAMPLE_PLAYERS, joined: null, answered: 21, tallies: null, answers: null, names: null });
    expect(running).toMatchObject({ answered: 21, spread: null, captions: [], fastest: null });
    expect(running.question?.correct).toBeNull();
    const open = buildScreen({ title: "Kuis", run: soal, now: SAMPLE_T0 + times.reveal, players: SAMPLE_PLAYERS, joined: null, answered: 30, tallies: sampleTallies(index, index - 1), answers: sampleAnswers(index), names: null });
    expect(open.spread?.answered).toBe(sampleAnswers(index).length);
    expect(open.fastest?.alias.name).toBeTruthy();
    expect(noIds(open)).toBe(true);
  });

  it("slides the top 5 from the scoreboard before, keyed by place, not by person", () => {
    const rows = boardRows(sampleTallies(3, 1), true);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.slice(0, 5).map(row => row.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.every(row => row.fromRank !== null)).toBe(true);
    expect(noIds(rows)).toBe(true);
    expect(boardRows(sampleTallies(1, -1), false).every(row => row.fromRank === null && row.fromTotal === 0)).toBe(true);
  });

  it("names a winner only once the MC opened that place, #3 first", () => {
    const tallies = sampleTallies(7, -1);
    const names = new Map(tallies.map((row, i) => [row.employeeId, `Nama ${i}`]));
    const at = (revealed: number) => buildScreen({ title: "Kuis", run: sampleRun({ phase: "podium", index: 7, podiumRevealed: revealed }), now: SAMPLE_T0, players: SAMPLE_PLAYERS, joined: null, answered: null, tallies, answers: null, names });
    expect(at(1).podium?.map(entry => entry.name === null)).toEqual([true, true, false]);
    expect(at(3).podium?.every(entry => entry.name !== null)).toBe(true);
    expect(openWinnerIds(sampleRun({ phase: "podium", index: 7, podiumRevealed: 1 }), tallies, SAMPLE_PLAYERS)).toHaveLength(1);
    expect(openWinnerIds(sampleRun({ phase: "skor", index: 3 }), tallies, SAMPLE_PLAYERS)).toEqual([]);
  });

  it("finds the quickest right answer", () => {
    const answers = sampleAnswers(0);
    const best = Math.min(...answers.filter(answer => answer.correct).map(answer => answer.ms));
    expect(fastestOf(answers, sampleTallies(0, -1))?.ms).toBe(best);
    expect(fastestOf(answers, null)).toBeNull();
  });
});

describe("the MC's control", () => {
  it("gets the count while running and the share right only once open", () => {
    const running = buildControl({ quiz, run: soal, now: SAMPLE_T0 + times.open + 1_000, players: SAMPLE_PLAYERS, answered: 12, answers: null });
    expect(running).toMatchObject({ answered: 12, percentCorrect: null });
    expect(running.question?.correct).toBeNull();
    const open = buildControl({ quiz, run: soal, now: SAMPLE_T0 + times.light, players: SAMPLE_PLAYERS, answered: 30, answers: sampleAnswers(index) });
    expect(open.percentCorrect).toBeGreaterThan(0);
    expect(open.question?.correct).toBe(SAMPLE_QUESTIONS[index].correct);
  });
});

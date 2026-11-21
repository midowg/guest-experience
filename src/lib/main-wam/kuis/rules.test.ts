import { describe, expect, it } from "vitest";
import {
  COUNTDOWN_MS, GRACE_MS, TAP_SLACK_MS, captionText, captionsOf, compareTally, correctPoints, countChoices, gameElapsed, isPaused, judgeAnswer, levelMs,
  pausedAt, percents, pointsOf, rankTallies, realAt, secondsText, streakOf, totalOf,
} from "./rules";

/* Rancangan §2 and §4a: every check the owner asked for. */

describe("the score of a right answer (§2)", () => {
  it("is 500 the moment it opens, 400 at half time, 300 at the end", () => {
    expect(correctPoints(0, 15_000)).toBe(500);
    expect(correctPoints(7_500, 15_000)).toBe(400);
    expect(correctPoints(15_000, 15_000)).toBe(300);
    expect(correctPoints(14_999, 15_000)).toBe(300);
    expect(correctPoints(20_000, 15_000)).toBe(300);
    expect(correctPoints(-50, 15_000)).toBe(500);
  });

  it("matches the table for a Sedang question of 20 seconds", () => {
    expect([1_000, 5_000, 10_000, 19_000].map(ms => correctPoints(ms, 20_000))).toEqual([490, 450, 400, 310]);
  });

  it("is a whole number, rounded half up, and falls evenly with time (no jump under 0.5 s)", () => {
    expect(correctPoints(250, 20_000)).toBe(498);
    expect(correctPoints(150, 20_000)).toBe(499);
    expect(correctPoints(50, 20_000)).toBe(500);
    expect(correctPoints(499, 20_000)).toBe(495);
  });

  it("gives −100 for a wrong answer and 0 for none", () => {
    expect(pointsOf({ choice: 2, ms: 3_000 }, 0, 20_000)).toBe(-100);
    expect(pointsOf(null, 0, 20_000)).toBe(0);
    expect(pointsOf({ choice: 0, ms: 3_000 }, 0, 20_000)).toBe(470);
  });

  it("runs 15, 20, 30 and 40 seconds by level", () => {
    expect([1, 2, 3, 4].map(level => levelMs(level as 1 | 2 | 3 | 4))).toEqual([15_000, 20_000, 30_000, 40_000]);
  });

  it("adds up to a total that is the sum of the answers (canceled questions out)", () => {
    expect(totalOf([{ index: 0, points: 437 }, { index: 1, points: -100 }, { index: 2, points: 0 }, { index: 3, points: 310 }])).toBe(647);
    expect(totalOf([{ index: 0, points: 437 }, { index: 1, points: -100 }], [1])).toBe(437);
  });
});

describe("the game clock and the MC's pauses (§2.8)", () => {
  const start = 1_000_000;
  it("does not count the time paused", () => {
    const pauses = [{ from: start + 5_000, to: start + 8_000 }];
    expect(gameElapsed(start, pauses, start + 4_000)).toBe(4_000);
    expect(gameElapsed(start, pauses, start + 6_000)).toBe(5_000);
    expect(gameElapsed(start, pauses, start + 10_000)).toBe(7_000);
    expect(gameElapsed(start, [{ from: start + 5_000, to: null }], start + 60_000)).toBe(5_000);
  });

  it("finds the real time a game time is reached, and none while a pause holds it", () => {
    const pauses = [{ from: start + 5_000, to: start + 8_000 }];
    expect(realAt(start, pauses, 4_000)).toBe(start + 4_000);
    expect(realAt(start, pauses, 7_000)).toBe(start + 10_000);
    expect(realAt(start, [{ from: start + 5_000, to: null }], 7_000)).toBeNull();
    expect(realAt(start, [], 3_000)).toBe(start + 3_000);
  });

  it("knows when it is paused", () => {
    expect(isPaused([{ from: 1, to: 2 }])).toBe(false);
    expect(isPaused([{ from: 1, to: 2 }, { from: 5, to: null }])).toBe(true);
    expect(pausedAt([{ from: 10, to: 20 }], 15)).toBe(true);
    expect(pausedAt([{ from: 10, to: 20 }], 20)).toBe(false);
  });
});

describe("an answer reaching the server (§2.2, §2.3)", () => {
  // "Mulai soal" at 0: the question opens at 3 s, closes at 23 s (20 s), the answer opens at 25 s.
  const phaseAt = 1_000_000;
  const open = phaseAt + COUNTDOWN_MS;
  const base = { phaseAt, pauses: [], durMs: 20_000 };

  it("takes the phone's tap time when it is fair: not before the open, at most 1.5 s before it arrived", () => {
    expect(judgeAnswer({ ...base, tapAt: open + 5_000, recvAt: open + 5_400 })).toEqual({ ok: true, ms: 5_000, tapAt: open + 5_000 });
    expect(judgeAnswer({ ...base, tapAt: open + 5_000, recvAt: open + 5_000 + TAP_SLACK_MS })).toMatchObject({ ok: true, ms: 5_000 });
  });

  it("uses arrival − 1.5 s for a tap too early or claimed too long before it arrived", () => {
    expect(judgeAnswer({ ...base, tapAt: open + 5_000, recvAt: open + 5_000 + TAP_SLACK_MS + 1 })).toMatchObject({ ok: true, ms: 5_001 });
    expect(judgeAnswer({ ...base, tapAt: open - 2_000, recvAt: open + 4_000 })).toMatchObject({ ok: true, ms: 2_500 });
    expect(judgeAnswer({ ...base, tapAt: open + 9_000, recvAt: open + 4_000 })).toMatchObject({ ok: true, ms: 2_500 });
    // Arriving 1 s after it opened with a tap from before: never earlier than the open.
    expect(judgeAnswer({ ...base, tapAt: open - 500, recvAt: open + 1_000 })).toMatchObject({ ok: true, ms: 0 });
    // No tap time at all: the arrival is the tap.
    expect(judgeAnswer({ ...base, tapAt: Number.NaN, recvAt: open + 1_000 })).toMatchObject({ ok: true, ms: 1_000 });
  });

  it("accepts a tap before time is up that arrives at most 2 s after, and nothing later", () => {
    const close = open + 20_000;
    expect(judgeAnswer({ ...base, tapAt: close - 100, recvAt: close + 300 })).toEqual({ ok: true, ms: 19_900, tapAt: close - 100 });
    // On the way more than 1.5 s: taken at arrival − 1.5 s, after the close, so the lowest right value (300).
    expect(judgeAnswer({ ...base, tapAt: close - 100, recvAt: close + GRACE_MS - 1 })).toMatchObject({ ok: true, ms: 20_000 });
    expect(correctPoints(20_000, 20_000)).toBe(300);
    expect(judgeAnswer({ ...base, tapAt: close - 100, recvAt: close + GRACE_MS })).toEqual({ ok: false, reason: "habis" });
    expect(judgeAnswer({ ...base, tapAt: close, recvAt: close + 500 })).toEqual({ ok: false, reason: "habis" });
    expect(judgeAnswer({ ...base, tapAt: open - 100, recvAt: open - 50 })).toEqual({ ok: false, reason: "belum" });
  });

  it("does not count the pause in the answer time, and refuses a tap during it", () => {
    const pauses = [{ from: open + 4_000, to: open + 10_000 }];
    expect(judgeAnswer({ ...base, pauses, tapAt: open + 12_000, recvAt: open + 12_300 })).toMatchObject({ ok: true, ms: 6_000 });
    expect(judgeAnswer({ ...base, pauses, tapAt: open + 5_000, recvAt: open + 5_300 })).toEqual({ ok: false, reason: "jeda" });
    // Tapped just before the pause, arrived during it: counts, with the time of the tap.
    expect(judgeAnswer({ ...base, pauses: [{ from: open + 4_000, to: null }], tapAt: open + 3_900, recvAt: open + 4_500 })).toMatchObject({ ok: true, ms: 3_900 });
    // The window after time is up moves with the pause.
    const close = open + 20_000 + 6_000;
    expect(judgeAnswer({ ...base, pauses, tapAt: close - 200, recvAt: close + 1_000 })).toMatchObject({ ok: true });
  });
});

describe("standings and ties (§2.5)", () => {
  const row = (key: string, total: number, correctMs: number, lastCorrectAt: number | null, joinedAt = 0) => ({ key, total, correctMs, lastCorrectAt, joinedAt });
  it("puts the higher total first", () => {
    expect(rankTallies([row("a", 400, 0, 1), row("b", 900, 0, 1)]).map(item => [item.key, item.rank])).toEqual([["b", 1], ["a", 2]]);
  });
  it("breaks a tie by the smaller total time of right answers", () => {
    expect(rankTallies([row("b", 800, 4_200, 40_000), row("a", 800, 3_000, 50_000)])[0].key).toBe("a");
  });
  it("then by the earlier last right answer", () => {
    expect(rankTallies([row("a", 800, 3_000, 50_000), row("c", 800, 3_000, 42_000)])[0].key).toBe("c");
  });
  it("then by who joined first, so two never share a place", () => {
    const list = rankTallies([row("z", 0, 0, null, 5), row("y", 0, 0, null, 2)]);
    expect(list.map(item => item.rank)).toEqual([1, 2]);
    expect(list[0].key).toBe("y");
    expect(compareTally(row("a", 0, 0, null), row("a", 0, 0, null))).toBe(0);
  });
  it("counts right answers in a row back from a question (canceled skipped)", () => {
    const answers = [{ index: 0, correct: true }, { index: 1, correct: true }, { index: 3, correct: true }];
    expect(streakOf(answers, 3, [2])).toBe(3);
    expect(streakOf(answers, 3)).toBe(1);
    expect(streakOf([], 3)).toBe(0);
  });
});

describe("the spread and its captions (§4a)", () => {
  it("gives whole percents of those who answered that add up to 100", () => {
    expect(percents([1, 1, 1, 0]).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(percents([9, 64, 14, 13])).toEqual([9, 64, 14, 13]);
    expect(percents([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
    expect(countChoices([0, 1, 1, 3, 9])).toEqual([1, 2, 0, 1]);
  });

  it("says everyone was right, or almost", () => {
    expect(captionsOf([0, 107, 0, 0], 1)).toEqual([{ kind: "semua" }]);
    expect(captionText(captionsOf([0, 107, 0, 0], 1)[0])).toBe("Semua benar!");
    expect(captionsOf([3, 97, 0, 0], 1)).toEqual([{ kind: "hampir", percent: 97 }]);
    expect(captionText({ kind: "hampir", percent: 97 })).toBe("Hampir semua benar!");
  });

  it("says few were right, and that most fell for a wrong option", () => {
    const captions = captionsOf([9, 64, 14, 13], 0).map(captionText);
    expect(captions).toEqual(["Hanya 9% yang benar!", "64% tertipu pilihan B"]);
  });

  it("says nobody answered", () => {
    expect(captionsOf([0, 0, 0, 0], 2)).toEqual([{ kind: "kosong" }]);
  });

  it("says nothing special for an ordinary spread", () => {
    expect(captionsOf([20, 50, 20, 10], 1)).toEqual([]);
    expect(secondsText(1_234)).toBe("1,2");
  });
});

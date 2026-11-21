import { describe, expect, it } from "vitest";
import {
  PODIUM_DONE_AT, PODIUM_LAND_AT, answerOpen, applyAction, boardRequiredBefore, canBoardNow, canCancel, controlStatus, nextStep, podiumPlaceOpen, podiumState,
  publicUpto, revealInstant, snapshotVersion, soalState, soalTimes, type ControlAction, type FlowRun,
} from "./flow";
import type { QuizLevel } from "./types";

/* The flow of a game (rancangan §7, prototype revisi 2): phases in order, Lanjut's label, Jeda, Batalkan. */

const LEVELS: QuizLevel[] = [1, 1, 2, 3, 4, 4];
const T0 = 2_000_000_000_000;
const run = (patch: Partial<FlowRun> = {}): FlowRun => ({ phase: "siap", index: -1, levels: LEVELS, phaseAt: T0, pauses: [], canceled: [], boards: [], podiumRevealed: 0, ...patch });

/** Press Lanjut (or another action) and keep the result, as the server does. */
function press(state: FlowRun, action: ControlAction, now: number, players = 5): FlowRun {
  const result = applyAction(state, action, { now, players });
  if (!result.ok) throw new Error(`${action}: ${result.message}`);
  return { ...state, ...result.patch };
}

describe("a question by the clock", () => {
  const level = 2; // 20 s
  const times = soalTimes(level);
  it("opens 3 s after Mulai soal, closes after its time, opens the answer 2 s later, lights it 1.5 s after", () => {
    expect(times).toEqual({ durMs: 20_000, open: 3_000, close: 23_000, reveal: 25_000, light: 26_500 });
    const state = run({ phase: "soal", index: 2, phaseAt: T0 });
    expect(soalState(state, T0 + 1_000)).toMatchObject({ stage: "hitung", countdownMs: 2_000 });
    expect(soalState(state, T0 + 13_000)).toMatchObject({ stage: "jalan", elapsedMs: 10_000, leftMs: 10_000 });
    expect(soalState(state, T0 + 24_000).stage).toBe("habis");
    expect(soalState(state, T0 + 25_500).stage).toBe("sebaran");
    expect(soalState(state, T0 + 27_000).stage).toBe("buka");
  });

  it("opens the answer (the key, the spread, the scores) only at close + 2 s", () => {
    const state = run({ phase: "soal", index: 2, phaseAt: T0 });
    expect(answerOpen(state, T0 + 24_999)).toBe(false);
    expect(answerOpen(state, T0 + 25_000)).toBe(true);
    expect(revealInstant(state)).toBe(T0 + 25_000);
    expect(publicUpto(state, T0 + 24_999)).toBe(1);
    expect(publicUpto(state, T0 + 25_000)).toBe(2);
    expect(snapshotVersion({ ...state, id: "r", rev: 4 }, T0 + 24_999)).toBe("r.4.0");
    expect(snapshotVersion({ ...state, id: "r", rev: 4 }, T0 + 25_000)).toBe("r.4.1");
  });

  it("stops while paused and moves the answer's opening by the pause", () => {
    const paused = run({ phase: "soal", index: 2, phaseAt: T0, pauses: [{ from: T0 + 10_000, to: null }] });
    expect(soalState(paused, T0 + 60_000)).toMatchObject({ stage: "jalan", leftMs: 13_000 });
    expect(revealInstant(paused)).toBeNull();
    const resumed = run({ phase: "soal", index: 2, phaseAt: T0, pauses: [{ from: T0 + 10_000, to: T0 + 40_000 }] });
    expect(revealInstant(resumed)).toBe(T0 + 55_000);
    expect(answerOpen(resumed, T0 + 54_000)).toBe(false);
  });
});

describe("Lanjut names the next step, and the phases go in order", () => {
  it("walks a whole game: lobby, level cards, questions, scoreboards, podium, end", () => {
    let state = run();
    let now = T0;
    const labels: string[] = [];
    const step = (players = 5) => {
      const next = nextStep(state, players, now);
      labels.push(next.label);
      if (!next.action) throw new Error(`waiting: ${next.label}`);
      state = press(state, next.action, now, players);
    };
    const finishQuestion = () => {
      labels.push(nextStep(state, 5, now + 100).label);
      now += soalTimes(state.levels[state.index]).light;
      labels.push(nextStep(state, 5, now - 1_000).label);
    };
    step(); // siap → lobi
    step(); // lobi → bersiap 0
    for (let question = 0; question < LEVELS.length; question += 1) {
      step(); // mulai soal
      finishQuestion();
      if (question < LEVELS.length - 1 && nextStep(state, 5, now).action === "papan-skor") step();
      if (question < LEVELS.length - 1) step(); // to the next question
    }
    step(); // podium, #3
    for (let place = 2; place >= 1; place -= 1) { now += PODIUM_DONE_AT; step(); }
    now += PODIUM_DONE_AT;
    step(); // selesai
    expect(state.phase).toBe("selesai");
    expect(labels).toEqual([
      "Lanjut: Buka lobi", "Lanjut: Tutup lobi, mulai kuis",
      "Lanjut: Mulai soal 1", "Soal berjalan sampai waktu habis", "Membuka jawaban bersama", "Lanjut: Bersiap soal 2",
      "Lanjut: Mulai soal 2", "Soal berjalan sampai waktu habis", "Membuka jawaban bersama", "Lanjut: Papan skor", "Lanjut: Kartu level Sedang",
      "Lanjut: Mulai soal 3", "Soal berjalan sampai waktu habis", "Membuka jawaban bersama", "Lanjut: Papan skor", "Lanjut: Kartu level Sulit",
      "Lanjut: Mulai soal 4", "Soal berjalan sampai waktu habis", "Membuka jawaban bersama", "Lanjut: Papan skor", "Lanjut: Kartu level Sangat sulit",
      "Lanjut: Mulai soal 5", "Soal berjalan sampai waktu habis", "Membuka jawaban bersama", "Lanjut: Bersiap soal 6",
      "Lanjut: Mulai soal 6", "Soal berjalan sampai waktu habis", "Membuka jawaban bersama", "Lanjut: Podium, buka juara #3",
      "Lanjut: Buka juara #2", "Lanjut: Buka juara #1", "Lanjut: Selesai",
    ]);
    expect(state.boards).toEqual([1, 2, 3]);
  });

  it("waits for a player before the lobby closes", () => {
    expect(nextStep(run({ phase: "lobi" }), 0, T0)).toEqual({ action: null, label: "Menunggu pemain bergabung" });
  });

  it("opens the podium for fewer winners when fewer play, and ends at once with nobody", () => {
    const after = run({ phase: "batal", index: LEVELS.length - 1 });
    expect(nextStep(after, 2, T0).label).toBe("Lanjut: Podium, buka juara #2");
    expect(nextStep(after, 0, T0)).toEqual({ action: "selesai", label: "Lanjut: Selesai" });
  });

  it("waits while a winner is being opened", () => {
    const podium = run({ phase: "podium", index: 5, podiumRevealed: 1, phaseAt: T0 });
    expect(nextStep(podium, 5, T0 + 1_000)).toEqual({ action: null, label: "Membuka juara #3" });
    expect(podiumState(podium, 3, T0 + PODIUM_LAND_AT - 1).stage).toBe("putar");
    expect(podiumState(podium, 3, T0 + PODIUM_LAND_AT).stage).toBe("mendarat");
    expect(nextStep(podium, 5, T0 + PODIUM_DONE_AT)).toEqual({ action: "buka-juara", label: "Lanjut: Buka juara #2" });
  });

  it("opens a place's name on the podium from #3 up, only once the MC opened it", () => {
    const podium = run({ phase: "podium", index: 5, podiumRevealed: 1 });
    expect([1, 2, 3].map(rank => podiumPlaceOpen(podium, 3, rank))).toEqual([false, false, true]);
    expect([1, 2, 3].map(rank => podiumPlaceOpen({ ...podium, podiumRevealed: 3 }, 3, rank))).toEqual([true, true, true]);
    expect(podiumPlaceOpen(run({ phase: "skor", index: 2 }), 3, 1)).toBe(false);
  });

  it("refuses a step that is not the one Lanjut names (a second press, an old screen)", () => {
    const soal = run({ phase: "soal", index: 0, phaseAt: T0 });
    expect(applyAction(soal, "lanjut-soal", { now: T0 + 5_000, players: 5 })).toMatchObject({ ok: false });
    expect(applyAction(run({ phase: "bersiap", index: 0 }), "buka-lobi", { now: T0, players: 5 })).toMatchObject({ ok: false });
    expect(applyAction(run(), "buka-lobi", { now: T0, players: 0 })).toMatchObject({ ok: true, patch: { phase: "lobi" } });
  });

  it("requires the scoreboard before Sangat sulit", () => {
    expect(boardRequiredBefore(LEVELS, 4)).toBe(true);
    expect(boardRequiredBefore(LEVELS, 5)).toBe(false);
    const done = run({ phase: "batal", index: 3 });
    expect(applyAction(done, "lanjut-soal", { now: T0, players: 5 })).toMatchObject({ ok: false });
    expect(nextStep(done, 5, T0).action).toBe("papan-skor");
  });
});

describe("Jeda, Papan skor sekarang, Batalkan soal", () => {
  it("pauses anywhere from the lobby to the podium, and Lanjut resumes from the same second", () => {
    const soal = run({ phase: "soal", index: 2, phaseAt: T0 });
    const paused = press(soal, "jeda", T0 + 10_000);
    expect(paused.pauses).toEqual([{ from: T0 + 10_000, to: null }]);
    expect(nextStep(paused, 5, T0 + 20_000)).toEqual({ action: "lanjutkan", label: "Lanjutkan soal" });
    expect(applyAction(paused, "jeda", { now: T0 + 11_000, players: 5 })).toMatchObject({ ok: false });
    expect(applyAction(paused, "mulai-soal", { now: T0 + 11_000, players: 5 })).toMatchObject({ ok: false, message: "Kuis sedang dijeda. Lanjutkan dulu." });
    const resumed = press(paused, "lanjutkan", T0 + 40_000);
    expect(resumed.pauses).toEqual([{ from: T0 + 10_000, to: T0 + 40_000 }]);
    expect(soalState(resumed, T0 + 40_000).leftMs).toBe(13_000);
    expect(applyAction(run(), "jeda", { now: T0, players: 5 })).toMatchObject({ ok: false });
    expect(applyAction(run({ phase: "selesai" }), "jeda", { now: T0, players: 5 })).toMatchObject({ ok: false });
  });

  it("cancels the question in play only, any stage, and starts the next phase clean", () => {
    const soal = run({ phase: "soal", index: 2, phaseAt: T0, pauses: [{ from: T0 + 5_000, to: null }] });
    expect(canCancel(soal)).toBe(true);
    const canceled = press(soal, "batalkan", T0 + 6_000);
    expect(canceled).toMatchObject({ phase: "batal", index: 2, canceled: [2], pauses: [], phaseAt: T0 + 6_000 });
    expect(canCancel(canceled)).toBe(false);
    expect(applyAction(canceled, "batalkan", { now: T0, players: 5 })).toMatchObject({ ok: false });
  });

  it("shows a scoreboard now after a question (not the last, once)", () => {
    const open = run({ phase: "soal", index: 0, phaseAt: T0 });
    const lit = T0 + soalTimes(1).light;
    expect(canBoardNow(open, lit - 1)).toBe(false);
    expect(canBoardNow(open, lit)).toBe(true);
    const board = press(open, "papan-skor", lit);
    expect(board).toMatchObject({ phase: "skor", boards: [0] });
    expect(canBoardNow(board, lit)).toBe(false);
    expect(canBoardNow(run({ phase: "batal", index: 5 }), T0)).toBe(false);
  });
});

describe("the MC's status line", () => {
  it("says where the game is", () => {
    expect(controlStatus(run(), 0, null, T0).main).toBe("Kuis belum dibuka");
    expect(controlStatus(run({ phase: "lobi" }), 12, null, T0).main).toBe("Lobi terbuka · 12 bergabung");
    const soal = run({ phase: "soal", index: 2, phaseAt: T0 });
    expect(controlStatus(soal, 12, 7, T0 + 13_000)).toMatchObject({ main: "Soal 3 dari 6 · Sedang · 10 dtk lagi", sub: "7 dari 12 sudah menjawab · tidak ditutup lebih awal", tone: "run" });
    expect(controlStatus(soal, 12, 7, T0 + 27_000).main).toBe("Jawaban dibuka · menunggu MC");
    const paused = { ...soal, pauses: [{ from: T0 + 13_000, to: null }] };
    expect(controlStatus(paused, 12, 7, T0 + 78_000)).toMatchObject({ main: "Dijeda · Soal 3 dari 6 · Sedang · 10 dtk lagi", tone: "pause" });
    expect(controlStatus(paused, 12, 7, T0 + 78_000).sub).toBe("Berhenti 1:05 · waktu jeda tidak dihitung ke waktu jawab");
  });
});

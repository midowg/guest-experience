import { COUNTDOWN_MS, GRACE_MS, SPREAD_MS, gameElapsed, isPaused, levelLabels, levelMs, realAt } from "./rules";
import type { Pause, QuizLevel, QuizPhase, QuizRun, RunView } from "./types";

/*
 * Kuis live's flow (rancangan §7, prototype revisi 2): the MC holds one button, Lanjut (Space), that
 * always names the next step ("Lanjut: Papan skor"), and Jeda (P), which freezes the time for everyone
 * (the pause is not answer time). A question always runs to its end (no early close), the answer opens
 * by itself at close + 2 s, and then the flow waits for the MC. Batalkan soal (after a confirmation)
 * leaves a question unscored. Every screen derives where a run is from the run and the server's clock
 * with these pure functions; the server applies the MC's actions with applyAction.
 */

export type FlowRun = Pick<RunView, "phase" | "index" | "levels" | "phaseAt" | "pauses" | "canceled" | "boards" | "podiumRevealed">;

/** Inside a question, by the clock: 3-2-1, running, time up (2 s, the drum), the spread (1.5 s), the answer. */
export type SoalStage = "hitung" | "jalan" | "habis" | "sebaran" | "buka";

/** When each moment of a question comes, in game time since "Mulai soal". */
export function soalTimes(level: QuizLevel) {
  const durMs = levelMs(level);
  const open = COUNTDOWN_MS;
  const close = open + durMs;
  const reveal = close + GRACE_MS;
  return { durMs, open, close, reveal, light: reveal + SPREAD_MS };
}

/** Where a question stands at `now`: its stage, game time, and the time left to answer. */
export function soalState(run: Pick<FlowRun, "phaseAt" | "pauses" | "levels" | "index">, now: number) {
  const times = soalTimes(run.levels[run.index] ?? 2);
  const g = gameElapsed(run.phaseAt, run.pauses, now);
  const stage: SoalStage = g < times.open ? "hitung" : g < times.close ? "jalan" : g < times.reveal ? "habis" : g < times.light ? "sebaran" : "buka";
  return { ...times, g, stage, elapsedMs: Math.max(0, Math.min(times.durMs, g - times.open)), leftMs: Math.max(0, times.close - g), countdownMs: Math.max(0, times.open - g) };
}

/** Is the answer of the question in play open (its key, the spread and the scores may leave the server)? */
export function answerOpen(run: FlowRun, now: number): boolean {
  if (run.phase !== "soal") return false;
  return soalState(run, now).g >= soalTimes(run.levels[run.index] ?? 2).reveal;
}

/** The real time the answer opens (null while a pause holds it back, or outside a question). */
export function revealInstant(run: FlowRun): number | null {
  if (run.phase !== "soal") return null;
  return realAt(run.phaseAt, run.pauses, soalTimes(run.levels[run.index] ?? 2).reveal);
}

/** The last question whose answer and scores are public at `now` (-1: none yet). */
export function publicUpto(run: FlowRun, now: number): number {
  switch (run.phase) {
    case "siap": case "lobi": return -1;
    case "bersiap": return run.index - 1;
    case "soal": return answerOpen(run, now) ? run.index : run.index - 1;
    case "batal": case "skor": return run.index;
    case "podium": case "selesai": return run.levels.length - 1;
  }
}

/** The version a client keeps: it changes with every write (rev) and when the answer opens by the clock. */
export const snapshotVersion = (run: (FlowRun & { rev: number; id: string }) | null, now: number) =>
  run ? `${run.id}.${run.rev}.${answerOpen(run, now) ? 1 : 0}` : "none";

/* ── The podium: each winner, the tokoh first (with the drum), then the coin, then the name ───── */

export const PODIUM = { lead: 600, drum: 2000, spin: 3600, settle: 1000 } as const;
export const PODIUM_SPIN_AT = PODIUM.lead + PODIUM.drum;
export const PODIUM_LAND_AT = PODIUM_SPIN_AT + PODIUM.spin;
export const PODIUM_DONE_AT = PODIUM_LAND_AT + PODIUM.settle;

/** The place being opened now (#3 first), and how far its opening is. */
export function podiumState(run: FlowRun, winners: number, now: number) {
  const g = gameElapsed(run.phaseAt, run.pauses, now);
  const opening = run.podiumRevealed > 0 ? winners - run.podiumRevealed + 1 : null;
  const stage = !opening ? "kosong" as const : g < PODIUM.lead ? "tunggu" as const : g < PODIUM_SPIN_AT ? "tokoh" as const : g < PODIUM_LAND_AT ? "putar" as const : g < PODIUM_DONE_AT ? "mendarat" as const : "diam" as const;
  return { g, opening, stage, done: stage === "diam" || stage === "kosong" };
}

/** Is this place's name open on the big screen at `now` (the coin has started for it, or it was opened before)? */
export function podiumPlaceOpen(run: FlowRun, winners: number, rank: number): boolean {
  if (run.phase === "selesai") return rank <= winners;
  if (run.phase !== "podium") return false;
  return rank > winners - run.podiumRevealed;
}

/* ── Lanjut ─────────────────────────────────────────────────────────────────────────────────────── */

export type ControlAction = "buka-lobi" | "mulai" | "mulai-soal" | "papan-skor" | "lanjut-soal" | "podium" | "buka-juara" | "selesai" | "jeda" | "lanjutkan" | "batalkan";
export const CONTROL_ACTIONS: readonly ControlAction[] = ["buka-lobi", "mulai", "mulai-soal", "papan-skor", "lanjut-soal", "podium", "buka-juara", "selesai", "jeda", "lanjutkan", "batalkan"];

const last = (run: Pick<FlowRun, "levels">) => run.levels.length - 1;
/** Sangat sulit is the last round: a scoreboard is a must before it. */
export const boardRequiredBefore = (levels: readonly QuizLevel[], index: number) => index > 0 && levels[index] === 4 && levels[index - 1] !== 4;
export const endOfLevel = (levels: readonly QuizLevel[], index: number) => index >= levels.length - 1 || levels[index + 1] !== levels[index];
export const winnersOf = (players: number) => Math.max(0, Math.min(3, players));

/** A question is over for the MC: its answer has lit (soal), or it was cancelled. */
function questionDone(run: FlowRun, now: number): boolean {
  if (run.phase === "batal") return true;
  return run.phase === "soal" && soalState(run, now).stage === "buka";
}

export type NextStep = { action: ControlAction | null; label: string };

function nextQuestion(run: FlowRun): NextStep {
  const next = run.index + 1;
  return run.levels[next] !== run.levels[run.index]
    ? { action: "lanjut-soal", label: `Lanjut: Kartu level ${levelLabels[run.levels[next]]}` }
    : { action: "lanjut-soal", label: `Lanjut: Bersiap soal ${next + 1}` };
}

function afterQuestion(run: FlowRun, players: number): NextStep {
  if (run.index >= last(run)) {
    const winners = winnersOf(players);
    return winners ? { action: "podium", label: `Lanjut: Podium, buka juara #${winners}` } : { action: "selesai", label: "Lanjut: Selesai" };
  }
  if (run.phase !== "skor" && endOfLevel(run.levels, run.index) && !run.boards.includes(run.index)) return { action: "papan-skor", label: "Lanjut: Papan skor" };
  return nextQuestion(run);
}

/** What the MC's Lanjut does now, and its label; `action: null` = waiting (the label says for what). */
export function nextStep(run: FlowRun | null, players: number, now: number): NextStep {
  if (!run) return { action: null, label: "Belum ada permainan" };
  if (isPaused(run.pauses)) return { action: "lanjutkan", label: run.phase === "soal" && soalState(run, now).stage === "jalan" ? "Lanjutkan soal" : "Lanjutkan" };
  switch (run.phase) {
    case "siap": return { action: "buka-lobi", label: "Lanjut: Buka lobi" };
    case "lobi": return players > 0 ? { action: "mulai", label: "Lanjut: Tutup lobi, mulai kuis" } : { action: null, label: "Menunggu pemain bergabung" };
    case "bersiap": return { action: "mulai-soal", label: `Lanjut: Mulai soal ${run.index + 1}` };
    case "soal": {
      const stage = soalState(run, now).stage;
      if (stage === "hitung" || stage === "jalan") return { action: null, label: "Soal berjalan sampai waktu habis" };
      if (stage === "habis" || stage === "sebaran") return { action: null, label: "Membuka jawaban bersama" };
      return afterQuestion(run, players);
    }
    case "batal": case "skor": return afterQuestion(run, players);
    case "podium": {
      const winners = winnersOf(players);
      const state = podiumState(run, winners, now);
      if (!state.done) return { action: null, label: `Membuka juara #${state.opening}` };
      return run.podiumRevealed < winners
        ? { action: "buka-juara", label: `Lanjut: Buka juara #${winners - run.podiumRevealed}` }
        : { action: "selesai", label: "Lanjut: Selesai" };
    }
    case "selesai": return { action: null, label: "Kuis selesai" };
  }
}

/** Batalkan soal: while a question is in play (any stage), never twice. */
export const canCancel = (run: FlowRun | null) => !!run && run.phase === "soal";
/** Papan skor sekarang: after a question (not the last), when none was shown after it. */
export const canBoardNow = (run: FlowRun | null, now: number) => !!run && questionDone(run, now) && run.index < last(run) && !run.boards.includes(run.index);
/** Jeda: from the lobby to the podium (not before it opens, not once over). */
export const canPause = (run: FlowRun | null) => !!run && run.phase !== "siap" && run.phase !== "selesai";

export type RunPatch = Partial<Pick<QuizRun, "phase" | "index" | "phaseAt" | "pauses" | "canceled" | "boards" | "podiumRevealed" | "endedAt">>;
export type ActionResult = { ok: true; patch: RunPatch } | { ok: false; message: string };

const refuse = (message: string): ActionResult => ({ ok: false, message });
const phase = (to: QuizPhase, now: number, extra: RunPatch = {}): ActionResult => ({ ok: true, patch: { phase: to, phaseAt: now, pauses: [], ...extra } });
const STALE = "Langkah ini sudah tidak berlaku. Lihat keadaan terbaru di layar.";

/** The MC's action on the run as it is at `now`, as a change to save; or why not. */
export function applyAction(run: FlowRun, action: ControlAction, ctx: { now: number; players: number }): ActionResult {
  const { now, players } = ctx;
  const paused = isPaused(run.pauses);
  if (action === "jeda") {
    if (!canPause(run)) return refuse("Kuis belum berjalan, jadi belum bisa dijeda.");
    if (paused) return refuse("Kuis sudah dijeda.");
    return { ok: true, patch: { pauses: [...run.pauses, { from: now, to: null }] } };
  }
  if (action === "lanjutkan") {
    if (!paused) return refuse("Kuis tidak sedang dijeda.");
    return { ok: true, patch: { pauses: run.pauses.map((pause: Pause) => (pause.to === null ? { ...pause, to: now } : pause)) } };
  }
  if (action === "batalkan") {
    if (!canCancel(run)) return refuse("Tidak ada soal yang sedang berjalan.");
    return phase("batal", now, { canceled: [...new Set([...run.canceled, run.index])] });
  }
  if (action === "papan-skor") {
    if (!canBoardNow(run, now)) return refuse(paused ? "Kuis sedang dijeda. Lanjutkan dulu." : "Papan skor belum bisa dibuka sekarang.");
    return phase("skor", now, { boards: [...run.boards, run.index] });
  }
  if (paused) return refuse("Kuis sedang dijeda. Lanjutkan dulu.");
  const step = nextStep(run, players, now);
  // The other actions are Lanjut's: only the one it names now (a second press, or an old screen, is refused).
  if (step.action !== action) return refuse(STALE);
  switch (action) {
    case "buka-lobi": return phase("lobi", now);
    case "mulai": return run.levels.length ? phase("bersiap", now, { index: 0 }) : refuse("Kuis ini belum punya soal.");
    case "mulai-soal": return phase("soal", now);
    case "lanjut-soal": return phase("bersiap", now, { index: run.index + 1 });
    case "podium": return phase("podium", now, { podiumRevealed: 1 });
    case "buka-juara": return phase("podium", now, { podiumRevealed: run.podiumRevealed + 1 });
    case "selesai": return phase("selesai", now, { endedAt: now });
    default: return refuse(STALE);
  }
}

/** The MC's status line: "Soal 3 dari 18 · Sedang · 12 dtk lagi", "Jawaban dibuka · menunggu MC". */
export function controlStatus(run: FlowRun | null, players: number, answered: number | null, now: number): { main: string; sub: string; tone: "idle" | "run" | "wait" | "pause" } {
  if (!run) return { main: "Belum ada permainan", sub: "Admin WAM membuat permainan baru di Main WAM → Kuis.", tone: "idle" };
  const count = run.levels.length;
  const label = run.index >= 0 && run.index < count ? `Soal ${run.index + 1} dari ${count} · ${levelLabels[run.levels[run.index]]}` : "";
  let out: { main: string; sub: string; tone: "idle" | "run" | "wait" | "pause" };
  switch (run.phase) {
    case "siap": out = { main: "Kuis belum dibuka", sub: "Lanjut membuka lobi supaya peserta bisa ikut.", tone: "idle" }; break;
    case "lobi": out = { main: `Lobi terbuka · ${players} bergabung`, sub: "Peserta mengetuk Ikut di Beranda aplikasi.", tone: "wait" }; break;
    case "bersiap": out = { main: `${label} · bersiap`, sub: `${levelMs(run.levels[run.index]) / 1000} detik per soal`, tone: "wait" }; break;
    case "soal": {
      const state = soalState(run, now);
      if (state.stage === "hitung") out = { main: `${label} · dibuka dalam ${Math.ceil(state.countdownMs / 1000)}`, sub: "Hitung mundur 3-2-1 di semua layar.", tone: "run" };
      else if (state.stage === "jalan") out = { main: `${label} · ${Math.ceil(state.leftMs / 1000)} dtk lagi`, sub: `${answered ?? 0} dari ${players} sudah menjawab · tidak ditutup lebih awal`, tone: "run" };
      else if (state.stage === "buka") out = { main: "Jawaban dibuka · menunggu MC", sub: label, tone: "wait" };
      else out = { main: "Waktu habis · membuka jawaban", sub: label, tone: "run" };
      break;
    }
    case "batal": out = { main: `Soal ${run.index + 1} dibatalkan · menunggu MC`, sub: "Tidak dinilai.", tone: "wait" }; break;
    case "skor": out = { main: "Papan skor · menunggu MC", sub: `Setelah soal ${run.index + 1} dari ${count}`, tone: "wait" }; break;
    case "podium": {
      const winners = winnersOf(players);
      const state = podiumState(run, winners, now);
      out = state.done
        ? { main: run.podiumRevealed < winners ? "Podium · menunggu MC" : "Semua juara dibuka", sub: `${run.podiumRevealed} dari ${winners} juara dibuka`, tone: "wait" }
        : { main: `Membuka juara #${state.opening}`, sub: `${run.podiumRevealed - 1} dari ${winners} juara dibuka`, tone: "run" };
      break;
    }
    case "selesai": out = { main: "Kuis selesai", sub: "Hasil lengkap dengan nama ada di Admin WAM → Main WAM → Kuis.", tone: "idle" }; break;
  }
  if (isPaused(run.pauses)) {
    const since = run.pauses.find(pause => pause.to === null)!.from;
    return { main: `Dijeda · ${out.main.replace(" · menunggu MC", "")}`, sub: `Berhenti ${clockText(now - since)} · waktu jeda tidak dihitung ke waktu jawab`, tone: "pause" };
  }
  return out;
}

/** "1:05". */
export const clockText = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

import type { QuizPhase } from "./types";

/*
 * Every screen plays the same moment at the same time: each one keeps the server's clock (as the office
 * TV does) from its answers, and polls the server. Pure helpers, tested in clock.test.ts.
 */

/** One answer: when it was asked and received (local clock) and the server's clock in it. */
export type ClockSample = { sentAt: number; receivedAt: number; serverNow: number };

/**
 * Server time minus local time: from the answer with the shortest round trip (the least doubt), taking
 * the server's clock as read halfway through it. Keep the last few samples.
 */
export function clockOffset(samples: readonly ClockSample[]): number {
  const valid = samples.filter(sample => sample.receivedAt >= sample.sentAt && Number.isFinite(sample.serverNow));
  if (!valid.length) return 0;
  const best = valid.reduce((a, b) => (b.receivedAt - b.sentAt < a.receivedAt - a.sentAt ? b : a));
  return Math.round(best.serverNow - (best.sentAt + best.receivedAt) / 2);
}

export const KEEP_SAMPLES = 6;

/**
 * How long to wait before asking again: 1.5 s while a game is on, slower while nothing moves (not yet
 * open, over, hidden tab), and the network failing slows it down further.
 */
export function pollDelay(phase: QuizPhase | null, opts: { hidden?: boolean; failures?: number } = {}): number {
  const base = phase === null ? 15_000 : phase === "selesai" ? 15_000 : phase === "siap" ? 4_000 : 1_500;
  const hidden = opts.hidden ? Math.max(base, 10_000) : base;
  const failures = Math.min(opts.failures ?? 0, 4);
  return failures ? Math.min(20_000, Math.max(hidden, 2_500 * 2 ** (failures - 1))) : hidden;
}

/** A small spread so 120 phones do not ask in the same millisecond when the answer opens (0–400 ms). */
export const revealJitter = (random: () => number = Math.random) => 120 + Math.floor(random() * 300);

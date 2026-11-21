"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { KEEP_SAMPLES, clockOffset, pollDelay, revealJitter, type ClockSample } from "@/lib/main-wam/kuis/clock";
import { revealInstant } from "@/lib/main-wam/kuis/flow";
import type { QuizPhase, RunView } from "@/lib/main-wam/kuis/types";
import { activeLang, translateKnown } from "@/lib/main-wam/i18n";
import { mainWamPath } from "@/lib/routes";

/*
 * Kuis live on a screen (phone, MC, big screen): the server's clock kept from every answer (the office
 * TV's way, with the round trip), a poll that asks every 1.5 s while a game is on and once more right
 * when an answer opens, and a ticking "now". Previews pass a fixed moment and never ask.
 */

/** The server's clock on this device: Date.now() + the offset from the answers with the shortest round trip. */
export function useServerClock(initialServerNow: number, fixed?: number) {
  const samples = useRef<ClockSample[]>([]);
  const offset = useRef<number | null>(null);
  const record = useCallback((sample: ClockSample) => {
    samples.current = [...samples.current, sample].slice(-KEEP_SAMPLES);
    offset.current = clockOffset(samples.current);
  }, []);
  const now = useCallback(() => {
    if (fixed !== undefined) return fixed;
    // Before the first answer of its own: the page's time (rough; the first poll corrects it).
    if (offset.current === null) offset.current = initialServerNow - Date.now();
    return Date.now() + offset.current;
  }, [fixed, initialServerNow]);
  return { now, record };
}

/** A "now" on the server's clock that ticks (every `every` ms) while `active`. */
export function useNow(now: () => number, every = 100, active = true): number {
  const [value, setValue] = useState(now);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = 0;
    const step = (time: number) => {
      if (time - last >= every) { last = time; setValue(now()); }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [now, every, active]);
  // Not ticking (a preview): the fixed moment.
  return active ? value : now();
}

type Snap = { serverNow: number; v: string; same?: boolean; run: RunView | null };
export class KuisRequestError extends Error {
  constructor(message: string, public status = 0) { super(message); this.name = "KuisRequestError"; }
}

/** JSON to and from the kuis APIs (the site's own words on failure). */
export async function kuisRequest<T>(url: string, init: { method?: string; json?: unknown } = {}): Promise<{ data: T; sentAt: number; receivedAt: number }> {
  const sentAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET", credentials: "same-origin", cache: "no-store",
      ...(init.json !== undefined ? { body: JSON.stringify(init.json), headers: { "Content-Type": "application/json" } } : {}),
    });
  } catch {
    throw new KuisRequestError("", 0);
  }
  const receivedAt = Date.now();
  let body: { ok?: boolean; data?: T; message?: string } = {};
  try { body = await response.json(); } catch { /* not JSON */ }
  if (response.status === 401 && typeof window !== "undefined" && window.location.pathname.startsWith(mainWamPath.home)) {
    window.location.assign(mainWamPath.login(`${window.location.pathname}${window.location.search}`));
  }
  if (!response.ok || !body.ok) throw new KuisRequestError(translateKnown(activeLang(), body.message ?? ""), response.status);
  return { data: body.data as T, sentAt, receivedAt };
}

/**
 * Keep a snapshot fresh: ask again after pollDelay(phase), and right when the answer in play opens
 * (with a small spread so a room of phones does not ask in one millisecond). `same` answers keep the
 * snapshot (with `keep` merging the little that changes without a new version, e.g. the lobby's count).
 */
export function usePoll<S extends Snap>(options: {
  initial: S;
  url: (version?: string) => string;
  clock: { now: () => number; record: (sample: ClockSample) => void };
  keep?: (current: S, same: S) => S;
  /** Skip the version (the MC and the big screen always take the whole answer). */
  whole?: boolean;
  disabled?: boolean;
}) {
  const { initial, url, clock, keep, whole, disabled } = options;
  const [snap, setSnap] = useState<S>(initial);
  const [failures, setFailures] = useState(0);
  const [gone, setGone] = useState(false);
  const current = useRef(snap);
  const timer = useRef<number | null>(null);
  const failed = useRef(0);
  const alive = useRef(true);

  const take = useCallback((next: S) => {
    // Unchanged: keep it, with the new clock (a new object, so the next ask is scheduled again).
    if (next.same && !whole) setSnap(previous => (keep ? keep(previous, next) : { ...previous, serverNow: next.serverNow }));
    else setSnap(next);
  }, [keep, whole]);

  const ask = useCallback(async () => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    try {
      const { data, sentAt, receivedAt } = await kuisRequest<S>(url(whole ? undefined : current.current.v));
      if (!alive.current) return;
      clock.record({ sentAt, receivedAt, serverNow: data.serverNow });
      take(data);
      failed.current = 0;
      setFailures(0);
      setGone(false);
    } catch (problem) {
      if (!alive.current) return;
      if (problem instanceof KuisRequestError && problem.status === 404) setGone(true);
      failed.current += 1;
      setFailures(failed.current);
    }
  }, [clock, take, url, whole]);

  useEffect(() => { current.current = snap; }, [snap]);

  // Schedule the next ask from the snapshot in hand.
  useEffect(() => {
    if (disabled) return;
    alive.current = true;
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    const phase: QuizPhase | null = snap.run?.phase ?? null;
    const now = clock.now();
    let wait = pollDelay(phase, { hidden, failures });
    const reveal = snap.run ? revealInstant(snap.run) : null;
    if (reveal !== null && reveal > now - 200) wait = Math.min(wait, Math.max(0, reveal - now) + revealJitter());
    timer.current = window.setTimeout(() => { void ask(); }, wait);
    return () => { if (timer.current !== null) window.clearTimeout(timer.current); };
  }, [snap, failures, ask, clock, disabled]);

  // Back on screen, or back online: ask at once.
  useEffect(() => {
    if (disabled) return;
    const again = () => { if (document.visibilityState === "visible") void ask(); };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("online", again);
    void ask();
    return () => {
      alive.current = false;
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("online", again);
    };
  }, [ask, disabled]);

  return { snap, setSnap: take, failures, gone, refresh: ask };
}

const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (change: () => void) => {
  const query = window.matchMedia(REDUCE);
  query.addEventListener?.("change", change);
  return () => query.removeEventListener?.("change", change);
};
/** The device's "kurangi gerak". */
export const useReducedMotion = (): boolean => useSyncExternalStore(subscribeMotion, () => window.matchMedia(REDUCE).matches, () => false);

/** A short buzz (Android; iPhone's web has none). Only after the person touched the page. */
export function vibrate(pattern: number | number[]) {
  try {
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (navigator.vibrate && (!activation || activation.hasBeenActive)) navigator.vibrate(pattern);
  } catch { /* not supported */ }
}

/** "+437", "−100", "0": a score with its sign (the real minus). */
export const signed = (value: number, format: (n: number) => string) => (value > 0 ? `+${format(value)}` : value < 0 ? `−${format(-value)}` : format(0));
/** "1.240" or "−100". */
export const plain = (value: number, format: (n: number) => string) => (value < 0 ? `−${format(-value)}` : format(value));

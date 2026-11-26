"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/components/admin/shared/api";
import type { QueueOrder, QueueState } from "@/lib/coffee/types";
import { outOfDate, type CoffeeAdminApi } from "./api";

/*
 * The pengelola's queue in the browser: what the server last said, kept and refreshed quietly.
 * It is read again every ten seconds while the tab is visible and the moment the tab comes back;
 * nothing is asked while it is hidden, and a tick is skipped while the read before it still runs.
 * Selesai and Tolak show at once (the card leaves the queue) and are taken back when the server
 * refuses; when someone else got there first (409) the queue is read again instead, so nothing
 * that is already processed comes back.
 *
 * A read never undoes what an action showed (audit F1-02): one that started before an action, or
 * comes back while an action is still being sent, is thrown away, and the queue is read once more
 * when the last action is answered. A second press that lands on the card that moved up under
 * the pointer is ignored (audit F1-01).
 */

export const POLL_MS = 10_000;
/** After a card left the queue the next one sits where it was: Selesai on another card is ignored this long, so a double click finishes one order. */
export const CLICK_GUARD_MS = 700;
export type ActionResult = { ok: true; order: QueueOrder; message: string } | { ok: false; message: string; ignored?: boolean };

const byAge = (a: QueueOrder, b: QueueOrder) => Date.parse(a.orderedAt) - Date.parse(b.orderedAt) || a.id.localeCompare(b.id);
const without = (order: QueueOrder) => (state: QueueState): QueueState => state.waiting.some(item => item.id === order.id)
  ? { ...state, waiting: state.waiting.filter(item => item.id !== order.id), today: { ...state.today, diproses: Math.max(0, state.today.diproses - 1) } }
  : state;
const backIn = (order: QueueOrder) => (state: QueueState): QueueState => state.waiting.some(item => item.id === order.id)
  ? state
  : { ...state, waiting: [...state.waiting, order].sort(byAge), today: { ...state.today, diproses: state.today.diproses + 1 } };
/** A processed order joins "Baru diproses" and leaves the queue; it is counted once, also when it is told twice. */
const processed = (order: QueueOrder) => (state: QueueState): QueueState => {
  const status = order.status === "ditolak" ? "ditolak" : "selesai";
  const before = state.recent.find(item => item.id === order.id);
  const next = without(order)(state);
  return {
    ...next, recent: [order, ...next.recent.filter(item => item.id !== order.id)].slice(0, 6),
    today: before?.status === order.status ? next.today : { ...next.today, [status]: next.today[status] + 1 },
  };
};
const reopened = (before: QueueOrder, order: QueueOrder) => (state: QueueState): QueueState => {
  const status = before.status === "ditolak" ? "ditolak" : "selesai";
  const next = backIn(order)({ ...state, recent: state.recent.filter(item => item.id !== order.id) });
  return { ...next, today: { ...next.today, [status]: Math.max(0, next.today[status] - 1) } };
};

export function useQueue(api: CoffeeAdminApi, initial: QueueState | null, onNew: (orders: QueueOrder[]) => void) {
  const [state, setState] = useState<QueueState | null>(initial);
  const [error, setError] = useState("");
  /** Raised by every action, so a read that started before it never overwrites what the action showed. */
  const epoch = useRef(0);
  /** How many actions are being sent: no read is applied meanwhile. */
  const sending = useRef(0);
  /** The reads that still run, and the number of the newest one: an older answer never replaces a newer one. */
  const reading = useRef(0);
  const readNo = useRef(0);
  /** The orders already seen waiting, to tell which ones are new. */
  const known = useRef<Set<string> | null>(initial ? new Set(initial.waiting.map(order => order.id)) : null);
  const announce = useRef(onNew);
  useEffect(() => { announce.current = onNew; }, [onNew]);
  /** When a card last left the queue under the pointer (performance.now). */
  const leftAt = useRef(-Infinity);
  /** The orders whose Urungkan is being sent (audit F1-04: each has its own, so one never frees another's button). */
  const [undoing, setUndoing] = useState<ReadonlySet<string>>(() => new Set());
  const undoingNow = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const at = epoch.current;
    const mine = ++readNo.current;
    reading.current += 1;
    try {
      const next = await api.queue();
      if (at !== epoch.current || sending.current > 0 || mine !== readNo.current) return;
      const before = known.current;
      known.current = new Set(next.waiting.map(order => order.id));
      setState(next);
      setError("");
      const fresh = before ? next.waiting.filter(order => !before.has(order.id)) : [];
      if (fresh.length) announce.current(fresh);
    } catch (problem) {
      if (at === epoch.current && sending.current === 0 && mine === readNo.current) setError(errorMessage(problem));
    } finally {
      reading.current -= 1;
    }
  }, [api]);

  const hasInitial = useRef(initial !== null);
  useEffect(() => {
    let timer: number | undefined;
    const stop = () => { window.clearInterval(timer); timer = undefined; };
    // A tick is skipped while a read still runs or an action is being sent (the action reads again itself).
    const tick = () => { if (reading.current === 0 && sending.current === 0) void refresh(); };
    const start = () => { if (timer === undefined) timer = window.setInterval(tick, POLL_MS); };
    const onVisible = () => {
      if (document.visibilityState === "visible") { void refresh(); start(); }
      else stop();
    };
    if (document.visibilityState === "visible") { start(); if (!hasInitial.current) void refresh(); }
    hasInitial.current = false;
    document.addEventListener("visibilitychange", onVisible);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  const change = useCallback((fn: (state: QueueState) => QueueState) => setState(current => current ? fn(current) : current), []);
  /** An action starts: reads from before it are thrown away. It ends: the queue is read once when no other action runs. */
  const begin = useCallback(() => { epoch.current += 1; sending.current += 1; }, []);
  const end = useCallback(() => {
    epoch.current += 1;
    sending.current -= 1;
    if (sending.current === 0) void refresh();
  }, [refresh]);

  const decide = useCallback(async (order: QueueOrder, send: () => Promise<{ order: QueueOrder; message: string }>): Promise<ActionResult> => {
    begin();
    leftAt.current = performance.now();
    change(without(order));
    try {
      const done = await send();
      known.current?.delete(order.id);
      change(processed(done.order));
      return { ok: true, ...done };
    } catch (problem) {
      // Someone else got there first: the read at the end shows where the order is now.
      if (!outOfDate(problem)) change(backIn(order));
      return { ok: false, message: errorMessage(problem) };
    } finally { end(); }
  }, [begin, change, end]);

  const finish = useCallback(async (order: QueueOrder): Promise<ActionResult> => {
    if (performance.now() - leftAt.current < CLICK_GUARD_MS) return { ok: false, message: "", ignored: true };
    return decide(order, () => api.finish(order.id));
  }, [api, decide]);
  const reject = useCallback((order: QueueOrder, note: string) => decide(order, () => api.reject(order.id, note)), [api, decide]);

  /** Urungkan: the server decides (the window, the processor, the quota), so nothing moves before it answers. */
  const reopen = useCallback(async (order: QueueOrder): Promise<ActionResult> => {
    if (undoingNow.current.has(order.id)) return { ok: false, message: "", ignored: true };
    undoingNow.current.add(order.id);
    setUndoing(new Set(undoingNow.current));
    begin();
    try {
      const done = await api.reopen(order.id);
      known.current?.add(done.order.id);
      change(reopened(order, done.order));
      return { ok: true, ...done };
    } catch (problem) {
      return { ok: false, message: errorMessage(problem) };
    } finally {
      undoingNow.current.delete(order.id);
      setUndoing(new Set(undoingNow.current));
      end();
    }
  }, [api, begin, change, end]);

  /** Catat manual saved an order as done: it joins "Baru diproses" at once. */
  const recorded = useCallback((order: QueueOrder) => { epoch.current += 1; change(processed(order)); }, [change]);

  /** Batalkan catatan took a record made by hand back: it leaves "Baru diproses", and today's numbers are read again. */
  const cancelled = useCallback((order: QueueOrder) => {
    epoch.current += 1;
    change(current => ({ ...current, recent: current.recent.filter(item => item.id !== order.id) }));
    void refresh();
  }, [change, refresh]);

  return { state, error, refresh, finish, reject, reopen, recorded, cancelled, undoing };
}

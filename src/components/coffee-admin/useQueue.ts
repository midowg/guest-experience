"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/components/admin/shared/api";
import type { QueueOrder, QueueState } from "@/lib/coffee/types";
import { outOfDate, type CoffeeAdminApi } from "./api";

/*
 * The pengelola's queue in the browser: what the server last said, kept and refreshed quietly.
 * It is read again every ten seconds while the tab is visible and the moment the tab comes back;
 * nothing is asked while it is hidden. Selesai and Tolak show at once (the card leaves the queue)
 * and are taken back when the server refuses; when someone else got there first (409) the queue is
 * read again instead, so nothing that is already processed comes back.
 */

export const POLL_MS = 10_000;
export type ActionResult = { ok: true; order: QueueOrder; message: string } | { ok: false; message: string };

const byAge = (a: QueueOrder, b: QueueOrder) => Date.parse(a.orderedAt) - Date.parse(b.orderedAt) || a.id.localeCompare(b.id);
const without = (order: QueueOrder) => (state: QueueState): QueueState => state.waiting.some(item => item.id === order.id)
  ? { ...state, waiting: state.waiting.filter(item => item.id !== order.id), today: { ...state.today, diproses: Math.max(0, state.today.diproses - 1) } }
  : state;
const backIn = (order: QueueOrder) => (state: QueueState): QueueState => state.waiting.some(item => item.id === order.id)
  ? state
  : { ...state, waiting: [...state.waiting, order].sort(byAge), today: { ...state.today, diproses: state.today.diproses + 1 } };
const processed = (order: QueueOrder) => (state: QueueState): QueueState => {
  const status = order.status === "ditolak" ? "ditolak" : "selesai";
  return { ...state, recent: [order, ...state.recent.filter(item => item.id !== order.id)].slice(0, 6), today: { ...state.today, [status]: state.today[status] + 1 } };
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
  /** The orders already seen waiting, to tell which ones are new. */
  const known = useRef<Set<string> | null>(initial ? new Set(initial.waiting.map(order => order.id)) : null);
  const announce = useRef(onNew);
  useEffect(() => { announce.current = onNew; }, [onNew]);

  const refresh = useCallback(async () => {
    const at = epoch.current;
    try {
      const next = await api.queue();
      if (at !== epoch.current) return;
      const before = known.current;
      known.current = new Set(next.waiting.map(order => order.id));
      setState(next);
      setError("");
      const fresh = before ? next.waiting.filter(order => !before.has(order.id)) : [];
      if (fresh.length) announce.current(fresh);
    } catch (problem) {
      if (at === epoch.current) setError(errorMessage(problem));
    }
  }, [api]);

  const hasInitial = useRef(initial !== null);
  useEffect(() => {
    let timer: number | undefined;
    const stop = () => { window.clearInterval(timer); timer = undefined; };
    const start = () => { if (timer === undefined) timer = window.setInterval(() => void refresh(), POLL_MS); };
    const onVisible = () => {
      if (document.visibilityState === "visible") { void refresh(); start(); }
      else stop();
    };
    if (document.visibilityState === "visible") { start(); if (!hasInitial.current) void refresh(); }
    hasInitial.current = false;
    document.addEventListener("visibilitychange", onVisible);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  const change = (fn: (state: QueueState) => QueueState) => setState(current => current ? fn(current) : current);

  const decide = useCallback(async (order: QueueOrder, send: () => Promise<{ order: QueueOrder; message: string }>): Promise<ActionResult> => {
    epoch.current += 1;
    change(without(order));
    try {
      const done = await send();
      epoch.current += 1;
      change(processed(done.order));
      return { ok: true, ...done };
    } catch (problem) {
      epoch.current += 1;
      if (outOfDate(problem)) void refresh();
      else change(backIn(order));
      return { ok: false, message: errorMessage(problem) };
    }
  }, [refresh]);

  const finish = useCallback((order: QueueOrder) => decide(order, () => api.finish(order.id)), [api, decide]);
  const reject = useCallback((order: QueueOrder, note: string) => decide(order, () => api.reject(order.id, note)), [api, decide]);

  /** Urungkan: the server decides (the window, the processor, the quota), so nothing moves before it answers. */
  const reopen = useCallback(async (order: QueueOrder): Promise<ActionResult> => {
    epoch.current += 1;
    try {
      const done = await api.reopen(order.id);
      epoch.current += 1;
      known.current?.add(done.order.id);
      change(reopened(order, done.order));
      return { ok: true, ...done };
    } catch (problem) {
      epoch.current += 1;
      void refresh();
      return { ok: false, message: errorMessage(problem) };
    }
  }, [api, refresh]);

  /** Catat manual saved an order as done: it joins "Baru diproses" at once. */
  const recorded = useCallback((order: QueueOrder) => { epoch.current += 1; change(processed(order)); }, []);

  return { state, error, refresh, finish, reject, reopen, recorded };
}

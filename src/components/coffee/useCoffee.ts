"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MyOrder, MyState, Status } from "@/lib/coffee/types";
import { errorText, type ClaimBody, type ClaimDone, type CoffeeApi } from "./api";

/*
 * The employee's quota and claims in the browser: what the server last said, kept and refreshed
 * quietly. It is read again every fifteen seconds only while a claim is being processed and the
 * app is visible, and the moment the app comes back to the front; nothing is asked while it is
 * hidden, and a tick is skipped while the read before it still runs.
 *
 * The rules the pengelola's queue learnt in its audit hold here too: a read that started before an
 * action, or comes back while one is being sent, is thrown away (it would undo what the action
 * showed), and the state is read once more when the last action is answered. A claim or a
 * cancellation that is already being sent is not sent again (a double tap is one request).
 */

export const POLL_MS = 15_000;
export type ActionResult = { ok: true; order: MyOrder; message: string } | { ok: false; message: string; ignored?: boolean };

const newestFirst = (a: MyOrder, b: MyOrder) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt) || b.id.localeCompare(a.id);
const merged = (done: ClaimDone) => (state: MyState): MyState =>
  ({ ...state, me: done.me, orders: [done.order, ...state.orders.filter(order => order.id !== done.order.id)].sort(newestFirst) });
const statuses = (orders: MyOrder[]) => new Map<string, Status>(orders.map(order => [order.id, order.status]));

/** `onDecided`: claims that were waiting and are now done or refused (told once, when the read that shows it arrives). */
export function useCoffee(api: CoffeeApi, initial: MyState, onDecided: (orders: MyOrder[]) => void) {
  const [state, setState] = useState<MyState>(initial);
  /** Raised by every action, so a read that started before it never overwrites what the action showed. */
  const epoch = useRef(0);
  const sending = useRef(0);
  const reading = useRef(0);
  const readNo = useRef(0);
  /** Each claim's status as last shown, to tell which ones were decided since. */
  const known = useRef(statuses(initial.orders));
  const announce = useRef(onDecided);
  useEffect(() => { announce.current = onDecided; }, [onDecided]);
  const claiming = useRef(false);
  const [cancelling, setCancelling] = useState<ReadonlySet<string>>(() => new Set());
  const cancellingNow = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const at = epoch.current;
    const mine = ++readNo.current;
    reading.current += 1;
    try {
      const next = await api.state();
      if (at !== epoch.current || sending.current > 0 || mine !== readNo.current) return;
      const before = known.current;
      known.current = statuses(next.orders);
      setState(next);
      const decided = next.orders.filter(order => before.get(order.id) === "diproses" && (order.status === "selesai" || order.status === "ditolak"));
      if (decided.length) announce.current(decided);
    } catch {
      // Quiet: what is on screen stays, and the next tick (or coming back to the app) tries again.
    } finally {
      reading.current -= 1;
    }
  }, [api]);

  const waiting = state.orders.some(order => order.status === "diproses");
  useEffect(() => {
    let timer: number | undefined;
    const stop = () => { window.clearInterval(timer); timer = undefined; };
    const tick = () => { if (reading.current === 0 && sending.current === 0) void refresh(); };
    const start = () => { if (waiting && timer === undefined) timer = window.setInterval(tick, POLL_MS); };
    const onVisible = () => {
      if (document.visibilityState === "visible") { tick(); start(); }
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisible);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh, waiting]);

  const begin = useCallback(() => { epoch.current += 1; sending.current += 1; }, []);
  const end = useCallback(() => {
    epoch.current += 1;
    sending.current -= 1;
    if (sending.current === 0) void refresh();
  }, [refresh]);
  const took = useCallback((done: ClaimDone) => {
    known.current.set(done.order.id, done.order.status);
    setState(merged(done));
  }, []);

  /** Ajukan klaim. The server decides the quota; nothing shows as claimed before it answers. */
  const claim = useCallback(async (body: ClaimBody): Promise<ActionResult> => {
    if (claiming.current) return { ok: false, message: "", ignored: true };
    claiming.current = true;
    begin();
    try {
      const done = await api.claim(body);
      took(done);
      return { ok: true, order: done.order, message: done.message };
    } catch (problem) {
      return { ok: false, message: errorText(problem) };
    } finally {
      claiming.current = false;
      end();
    }
  }, [api, begin, end, took]);

  /** Batalkan pengajuan: the server decides (it may have been processed meanwhile). */
  const cancel = useCallback(async (id: string): Promise<ActionResult> => {
    if (cancellingNow.current.has(id)) return { ok: false, message: "", ignored: true };
    cancellingNow.current.add(id);
    setCancelling(new Set(cancellingNow.current));
    begin();
    try {
      const done = await api.cancel(id);
      took(done);
      return { ok: true, order: done.order, message: done.message };
    } catch (problem) {
      return { ok: false, message: errorText(problem) };
    } finally {
      cancellingNow.current.delete(id);
      setCancelling(new Set(cancellingNow.current));
      end();
    }
  }, [api, begin, end, took]);

  return { state, waiting, refresh, claim, cancel, cancelling };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GaState, MeetingOrder, Status } from "@/lib/coffee/types";
import { errorText, outOfDate } from "../api";
import type { GaApi, MeetingBody } from "./api";

/*
 * Today's meeting orders on the tablet: what the server last said, kept and refreshed quietly. As
 * the employee app (useCoffee): read again every fifteen seconds only while an order is being
 * processed and the tablet is visible, and the moment it comes back to the front; a read that
 * started before a sending, or comes back during one, is thrown away, and the list is read once
 * more when the sending is answered. An order that is already being sent is not sent again.
 */

export const POLL_MS = 15_000;
export type SendResult = { ok: true; order: MeetingOrder; message: string } | { ok: false; message: string; ignored?: boolean; stale?: boolean };

const newestFirst = (a: MeetingOrder, b: MeetingOrder) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt) || b.id.localeCompare(a.id);
const statuses = (orders: MeetingOrder[]) => new Map<string, Status>(orders.map(order => [order.id, order.status]));

/** `onDecided`: orders that were waiting and are now done or refused (told once, when the read that shows it arrives). */
export function useGa(api: GaApi, initial: GaState, onDecided: (orders: MeetingOrder[]) => void) {
  const [state, setState] = useState<GaState>(initial);
  const epoch = useRef(0);
  const sendingNow = useRef(false);
  const reading = useRef(0);
  const readNo = useRef(0);
  const known = useRef(statuses(initial.today));
  const announce = useRef(onDecided);
  useEffect(() => { announce.current = onDecided; }, [onDecided]);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    const at = epoch.current;
    const mine = ++readNo.current;
    reading.current += 1;
    try {
      const next = await api.state();
      if (at !== epoch.current || sendingNow.current || mine !== readNo.current) return;
      const before = known.current;
      known.current = statuses(next.today);
      setState(next);
      const decided = next.today.filter(order => before.get(order.id) === "diproses" && (order.status === "selesai" || order.status === "ditolak"));
      if (decided.length) announce.current(decided);
    } catch {
      // Quiet: what is on screen stays, and the next tick (or coming back to the tablet) tries again.
    } finally {
      reading.current -= 1;
    }
  }, [api]);

  const waiting = state.today.some(order => order.status === "diproses");
  useEffect(() => {
    let timer: number | undefined;
    const stop = () => { window.clearInterval(timer); timer = undefined; };
    const tick = () => { if (reading.current === 0 && !sendingNow.current) void refresh(); };
    const start = () => { if (waiting && timer === undefined) timer = window.setInterval(tick, POLL_MS); };
    const onVisible = () => {
      if (document.visibilityState === "visible") { tick(); start(); }
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisible);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh, waiting]);

  /** Kirim. Nothing shows as sent before the server answers. `stale`: the server refused because the tablet is out of date (409). */
  const send = useCallback(async (body: MeetingBody): Promise<SendResult> => {
    if (sendingNow.current) return { ok: false, message: "", ignored: true };
    sendingNow.current = true;
    setSending(true);
    epoch.current += 1;
    try {
      const done = await api.send(body);
      known.current.set(done.order.id, done.order.status);
      setState(current => ({ ...current, today: [done.order, ...current.today.filter(order => order.id !== done.order.id)].sort(newestFirst) }));
      return { ok: true, order: done.order, message: done.message };
    } catch (problem) {
      return { ok: false, message: errorText(problem), stale: outOfDate(problem) };
    } finally {
      epoch.current += 1;
      sendingNow.current = false;
      setSending(false);
      void refresh();
    }
  }, [api, refresh]);

  return { state, waiting, refresh, send, sending };
}

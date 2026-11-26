"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GaState, MeetingOrder, Status } from "@/lib/coffee/types";
import { REQUEST_TIMEOUT_MS, answerUnknown, errorText, outOfDate, within } from "../api";
import type { GaApi, MeetingBody } from "./api";
import { sameSending } from "./model";

/*
 * Today's meeting orders on the tablet: what the server last said, kept and refreshed quietly. As
 * the employee app (useCoffee): read again every fifteen seconds only while an order is being
 * processed (or the last read failed) and the tablet is visible, and the moment it comes back to
 * the front or finds the network again; a read that started before a sending, or comes back
 * during one, is thrown away, and the list is read once more when the sending is answered. An
 * order that is already being sent is not sent again.
 *
 * After the F3 audit (26 Nov 2026), as useCoffee after F2:
 * - Every request is let go of after a while: a Kirim that hangs gives the screen back, and a read
 *   that hangs no longer stops the reads after it.
 * - A read that fails is not silent: `stale` is true until one succeeds (a banner with "Coba lagi").
 * - A Kirim whose answer was lost is looked for in the read right after it: when the order did
 *   arrive it is shown as sent instead of being sent a second time.
 * - `paused` (a guest holds the tablet): nothing at all is asked of the server.
 */

export const POLL_MS = 15_000;
export const GUARD_MS = REQUEST_TIMEOUT_MS + 2_000;
export type SendResult =
  | { ok: true; order: MeetingOrder; message: string }
  /** `stale`: the server refused because the tablet is out of date (409, 404). `unsure`: no answer came back, the order may have arrived. */
  | { ok: false; message: string; ignored?: boolean; stale?: boolean; unsure?: boolean };

const newestFirst = (a: MeetingOrder, b: MeetingOrder) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt) || b.id.localeCompare(a.id);
const statuses = (orders: MeetingOrder[]) => new Map<string, Status>(orders.map(order => [order.id, order.status]));

/** `onDecided`: orders that were waiting and are now done or refused (told once, when the read that shows it arrives). */
export function useGa(api: GaApi, initial: GaState, onDecided: (orders: MeetingOrder[]) => void, paused = false) {
  const [state, setState] = useState<GaState>(initial);
  const [stale, setStale] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const epoch = useRef(0);
  const sendingNow = useRef(false);
  const reading = useRef(0);
  const readNo = useRef(0);
  const known = useRef(statuses(initial.today));
  const announce = useRef(onDecided);
  useEffect(() => { announce.current = onDecided; }, [onDecided]);
  const hold = useRef(paused);
  useEffect(() => { hold.current = paused; }, [paused]);
  const [sending, setSending] = useState(false);

  /** Reads the list. Answers with it when it was shown, null when it failed, was thrown away, or a guest holds the tablet. */
  const refresh = useCallback(async (): Promise<GaState | null> => {
    if (hold.current) return null;
    const at = epoch.current;
    const mine = ++readNo.current;
    reading.current += 1;
    try {
      const next = await within(api.state(), GUARD_MS);
      // Thrown away too when a guest took the tablet meanwhile: nothing of GA's is brought in behind the book.
      if (at !== epoch.current || sendingNow.current || mine !== readNo.current || hold.current) return null;
      const before = known.current;
      known.current = statuses(next.today);
      setState(next);
      setStale(false);
      const decided = next.today.filter(order => before.get(order.id) === "diproses" && (order.status === "selesai" || order.status === "ditolak"));
      if (decided.length) announce.current(decided);
      return next;
    } catch {
      // What is on screen stays; the banner says it may be out of date, and the next tick tries again.
      if (mine === readNo.current && !hold.current) setStale(true);
      return null;
    } finally {
      reading.current -= 1;
    }
  }, [api]);

  const waiting = state.today.some(order => order.status === "diproses");
  const polls = (waiting || stale) && !paused;
  useEffect(() => {
    if (paused) return;
    let timer: number | undefined;
    const stop = () => { window.clearInterval(timer); timer = undefined; };
    const tick = () => { if (reading.current === 0 && !sendingNow.current) void refresh(); };
    const start = () => { if (polls && timer === undefined) timer = window.setInterval(tick, POLL_MS); };
    const onVisible = () => {
      if (document.visibilityState === "visible") { tick(); start(); }
      else stop();
    };
    const onOnline = () => { if (document.visibilityState === "visible") tick(); };
    const onOffline = () => setStale(true);
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh, polls, paused]);

  // The GA officer is back from the guest's book: read at once (nothing was read meanwhile, and a
  // page reloaded in guest mode came without any of GA's data).
  const wasPaused = useRef(paused);
  useEffect(() => {
    if (wasPaused.current && !paused) void refresh();
    wasPaused.current = paused;
  }, [paused, refresh]);

  /** "Coba lagi" on the banner. */
  const retry = useCallback(async () => {
    if (reading.current > 0 || sendingNow.current) return;
    setRetrying(true);
    await refresh();
    setRetrying(false);
  }, [refresh]);

  /** Kirim. Nothing shows as sent before the server answers (or the read after a lost answer shows the order). */
  const send = useCallback(async (body: MeetingBody): Promise<SendResult> => {
    if (sendingNow.current) return { ok: false, message: "", ignored: true };
    sendingNow.current = true;
    setSending(true);
    epoch.current += 1;
    const before = new Set(known.current.keys());
    let done: { order: MeetingOrder; message: string } | null = null, failure: unknown = null;
    try {
      done = await within(api.send(body), GUARD_MS);
      const order = done.order;
      known.current.set(order.id, order.status);
      setState(current => ({ ...current, today: [order, ...current.today.filter(item => item.id !== order.id)].sort(newestFirst) }));
    } catch (problem) {
      failure = problem;
    }
    epoch.current += 1;
    sendingNow.current = false;
    const after = refresh();
    if (done) { setSending(false); return { ok: true, order: done.order, message: done.message }; }
    const unsure = answerUnknown(failure);
    // No answer came back: the read right after may show that the order arrived after all.
    const fresh = unsure ? await after : null;
    setSending(false);
    const arrived = fresh?.today.find(order => !before.has(order.id) && sameSending(order, body));
    if (arrived) return { ok: true, order: arrived, message: "Pesanan terkirim ke pengelola." };
    return { ok: false, message: errorText(failure), stale: outOfDate(failure), unsure };
  }, [api, refresh]);

  return { state, waiting, stale, retrying, retry, refresh, send, sending };
}

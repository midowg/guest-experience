"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { wibDay } from "@/lib/coffee/quota";
import type { MyOrder, MyState, Status } from "@/lib/coffee/types";
import { REQUEST_TIMEOUT_MS, answerUnknown, errorText, newKey, signedOut, within, type ClaimChoice, type ClaimDone, type CoffeeApi } from "./api";

/*
 * The employee's quota and claims in the browser: what the server last said, kept and refreshed
 * quietly. It is read again every fifteen seconds only while a claim is being processed (or the
 * last read failed) and the app is visible, and the moment the app comes back to the front or the
 * phone finds the network again; nothing is asked while it is hidden, and a tick is skipped while
 * the read before it still runs.
 *
 * The rules the pengelola's queue learnt in its audit hold here too: a read that started before an
 * action, or comes back while one is being sent, is thrown away (it would undo what the action
 * showed), and the state is read once more when the last action is answered. A claim or a
 * cancellation that is already being sent is not sent again (a double tap is one request).
 *
 * After the F2 audit (26 Nov 2026):
 * - Every request is let go of after a while (`within`): a read that hangs no longer stops the
 *   reads after it, and a claim that hangs gives the sheet back.
 * - The key of a claim lives here, per drink and options, until the server gives a definite answer
 *   (accepted or refused). When the answer is lost on the way, the same key goes out again, also
 *   after the sheet was closed and opened, and the state is read at once: a claim that did arrive
 *   shows instead of being made twice.
 * - A read that fails is no longer silent: `stale` is true until a read succeeds (the app shows a
 *   thin banner with "Coba lagi").
 * - `gone`: the server said the session ended; the app takes the person's data off the screen.
 */

export const POLL_MS = 15_000;
/** A little longer than the request's own limit, so the real client's own message wins when both run out. */
export const GUARD_MS = REQUEST_TIMEOUT_MS + 2_000;
export type ActionResult =
  | { ok: true; order: MyOrder; message: string }
  /** `order`: where a claim that could not be cancelled stands now (processed by someone meanwhile), when the read after it showed. */
  | { ok: false; message: string; ignored?: boolean; order?: MyOrder };

const newestFirst = (a: MyOrder, b: MyOrder) => Date.parse(b.orderedAt) - Date.parse(a.orderedAt) || b.id.localeCompare(a.id);
const merged = (done: ClaimDone) => (state: MyState): MyState =>
  ({ ...state, me: done.me, orders: [done.order, ...state.orders.filter(order => order.id !== done.order.id)].sort(newestFirst) });
const statuses = (orders: MyOrder[]) => new Map<string, Status>(orders.map(order => [order.id, order.status]));
const choiceOf = ({ slug, temperature, sugar, ice }: ClaimChoice) => `${slug}|${temperature}|${sugar}|${temperature === "es" ? ice : "Normal"}`;
const sameChoice = (order: MyOrder, choice: ClaimChoice) => !order.manual && choiceOf(order) === choiceOf(choice);

/** A claim whose answer never came back: its key, and the claims that were already there when it was sent. */
type Pending = { key: string; choice: ClaimChoice; before: Set<string>; unsure: boolean };

/** `onDecided`: claims that were waiting and are now done or refused (told once, when the read that shows it arrives). */
export function useCoffee(api: CoffeeApi, initial: MyState, onDecided: (orders: MyOrder[]) => void) {
  const [state, setState] = useState<MyState>(initial);
  const [stale, setStale] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [gone, setGone] = useState(false);
  /** The office's day (WIB) as of the last read: a claim done on an earlier day is no longer "ready now". */
  const [today, setToday] = useState(() => wibDay(new Date().toISOString()));
  /** Raised by every action, so a read that started before it never overwrites what the action showed. */
  const epoch = useRef(0);
  const sending = useRef(0);
  const reading = useRef(0);
  const readNo = useRef(0);
  /** Each claim's status as last shown, to tell which ones were decided since. */
  const known = useRef(statuses(initial.orders));
  /** Claims whose change the app tells about itself (a cancel that lost the race), so the read does not announce them again. */
  const quiet = useRef(new Set<string>());
  const pending = useRef(new Map<string, Pending>());
  const announce = useRef(onDecided);
  useEffect(() => { announce.current = onDecided; }, [onDecided]);
  const claiming = useRef(false);
  const [cancelling, setCancelling] = useState<ReadonlySet<string>>(() => new Set());
  const cancellingNow = useRef(new Set<string>());

  /** A read came back: claims whose answer was lost and that are in it after all need no second sending. */
  const settlePending = useCallback((orders: MyOrder[]): MyOrder | null => {
    let found: MyOrder | null = null;
    for (const [choice, item] of pending.current) {
      if (!item.unsure) continue;
      const arrived = orders.find(order => !item.before.has(order.id) && sameChoice(order, item.choice));
      if (arrived) { pending.current.delete(choice); found = arrived; }
    }
    return found;
  }, []);

  /** Reads the state. Answers with it when it was shown, null when it failed or was thrown away. */
  const refresh = useCallback(async (): Promise<MyState | null> => {
    const at = epoch.current;
    const mine = ++readNo.current;
    reading.current += 1;
    try {
      const next = await within(api.state(), GUARD_MS);
      if (at !== epoch.current || sending.current > 0 || mine !== readNo.current) return null;
      const before = known.current;
      known.current = statuses(next.orders);
      settlePending(next.orders);
      setState(next);
      setStale(false);
      setToday(wibDay(new Date().toISOString()));
      const decided = next.orders.filter(order => before.get(order.id) === "diproses" && (order.status === "selesai" || order.status === "ditolak") && !quiet.current.has(order.id));
      quiet.current.clear();
      if (decided.length) announce.current(decided);
      return next;
    } catch (problem) {
      // What is on screen stays; the banner says it may be out of date, and the next tick tries again.
      if (signedOut(problem)) setGone(true);
      else if (mine === readNo.current) setStale(true);
      return null;
    } finally {
      reading.current -= 1;
    }
  }, [api, settlePending]);

  const waiting = state.orders.some(order => order.status === "diproses");
  const polls = waiting || stale;
  useEffect(() => {
    let timer: number | undefined;
    const stop = () => { window.clearInterval(timer); timer = undefined; };
    const tick = () => { if (reading.current === 0 && sending.current === 0) void refresh(); };
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
  }, [refresh, polls]);

  /** "Coba lagi" on the banner. */
  const retry = useCallback(async () => {
    if (reading.current > 0 || sending.current > 0) return;
    setRetrying(true);
    await refresh();
    setRetrying(false);
  }, [refresh]);

  const begin = useCallback(() => { epoch.current += 1; sending.current += 1; }, []);
  const end = useCallback((): Promise<MyState | null> => {
    epoch.current += 1;
    sending.current -= 1;
    return sending.current === 0 ? refresh() : Promise.resolve(null);
  }, [refresh]);
  const took = useCallback((done: ClaimDone) => {
    known.current.set(done.order.id, done.order.status);
    setState(merged(done));
  }, []);

  /** Ajukan klaim. The server decides the quota; nothing shows as claimed before it answers. */
  const claim = useCallback(async (choice: ClaimChoice): Promise<ActionResult> => {
    if (claiming.current) return { ok: false, message: "", ignored: true };
    claiming.current = true;
    const id = choiceOf(choice);
    const item: Pending = pending.current.get(id) ?? { key: newKey(), choice, before: new Set(known.current.keys()), unsure: false };
    pending.current.set(id, item);
    let failure: unknown = null, done: ClaimDone | null = null;
    begin();
    try {
      done = await within(api.claim({ ...choice, key: item.key }), GUARD_MS);
      pending.current.delete(id);
      took(done);
    } catch (problem) {
      failure = problem;
      if (signedOut(problem)) setGone(true);
      // Refused for a reason: that key is spent. No answer at all: it is kept, the claim may have arrived.
      if (answerUnknown(problem)) item.unsure = true; else pending.current.delete(id);
    }
    claiming.current = false;
    // The read after the action. After a lost answer it may show the claim arrived after all.
    const after = end();
    if (done) return { ok: true, order: done.order, message: done.message };
    const fresh = await after;
    const arrived = item.unsure && fresh && !pending.current.has(id) ? fresh.orders.find(order => !item.before.has(order.id) && sameChoice(order, choice)) : undefined;
    if (arrived) return { ok: true, order: arrived, message: "Pengajuan terkirim." };
    return { ok: false, message: errorText(failure) };
  }, [api, begin, end, took]);

  /** Batalkan pengajuan: the server decides (it may have been processed meanwhile). */
  const cancel = useCallback(async (id: string): Promise<ActionResult> => {
    if (cancellingNow.current.has(id)) return { ok: false, message: "", ignored: true };
    cancellingNow.current.add(id);
    setCancelling(new Set(cancellingNow.current));
    let failure: unknown = null, done: ClaimDone | null = null;
    begin();
    try {
      done = await within(api.cancel(id), GUARD_MS);
      took(done);
    } catch (problem) {
      failure = problem;
      if (signedOut(problem)) setGone(true);
      // Refused: the app itself says what became of this claim, so the read below must not say it a second time.
      if (!answerUnknown(problem)) quiet.current.add(id);
    }
    cancellingNow.current.delete(id);
    setCancelling(new Set(cancellingNow.current));
    const after = end();
    if (done) return { ok: true, order: done.order, message: done.message };
    const fresh = await after;
    const now = fresh?.orders.find(order => order.id === id);
    return { ok: false, message: errorText(failure), order: now && now.status !== "diproses" ? now : undefined };
  }, [api, begin, end, took]);

  return { state, today, waiting, stale, retrying, retry, gone, refresh, claim, cancel, cancelling };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoffeePushInfo, CoffeePushState, CoffeePushWaiting } from "@/lib/coffee/notify";
import { deviceLabel, keyBytes, pushSupport, type PushSupport } from "@/lib/pra-wam/push";
import { coffeePath } from "@/lib/routes";
import { activeCoffeeWorker, coffeeWorker } from "./pwa";

/*
 * Web push on one device (F4): whether it can take notifications, turning them on and off, and the
 * service worker's messages to the open page. One hook for the three places that offer "Nyalakan
 * notifikasi" (the employee app, GA's tablet, the pengelola's admin): they differ only in which
 * API they talk to, so the API is passed in, and so is the device (the browser's own, or a
 * make-believe one in the preview and the tests).
 *
 * A device belongs to whoever is signed in on it. When the page opens and the device is already
 * subscribed, the subscription is saved again, which moves it to the person signed in now; signing
 * out removes it (dropPush). The subscription lives on Coffee's one service worker registration
 * (pwa.ts), so a browser has one endpoint whichever of the three places turned it on.
 *
 * Nothing here throws, and nothing waits for long: the app works the same without notifications
 * (the screens read the status themselves).
 */

/** What the server is asked: the public key, saving this device, removing it, and (the employee app) a test. */
export type PushApi = {
  info(): Promise<CoffeePushInfo>;
  save(subscription: PushSubscriptionJSON, device: string): Promise<void>;
  remove(endpoint: string): Promise<void>;
  test?(): Promise<string>;
};
type Subscription = { endpoint: string; toJSON(): PushSubscriptionJSON; unsubscribe(): Promise<boolean> };
/** What the device is asked. */
export type PushDevice = {
  support(): PushSupport;
  permission(): NotificationPermission;
  ask(): Promise<NotificationPermission>;
  current(): Promise<Subscription | null>;
  subscribe(publicKey: string): Promise<Subscription>;
  label(): string;
};
export type PushPort = { api: PushApi; device: PushDevice };

const hasPush = () => typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window && "Notification" in window;
const standalone = () => !!window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
/** `active`: wait until the worker is active, which subscribing needs (audit F5-03); looking for a subscription does not. */
async function registration(active = false): Promise<ServiceWorkerRegistration> {
  const found = await (active ? activeCoffeeWorker() : coffeeWorker());
  if (!found) throw new Error("no service worker");
  return found;
}

/** This browser, through Coffee's own service worker (registered here when the page has not done so yet). */
export const browserDevice: PushDevice = {
  support: () => typeof navigator === "undefined" ? "unsupported" : pushSupport({ userAgent: navigator.userAgent, standalone: standalone(), hasPush: hasPush() }),
  permission: () => typeof Notification === "undefined" ? "denied" : Notification.permission,
  ask: () => Notification.requestPermission(),
  current: async () => (await registration()).pushManager.getSubscription(),
  subscribe: async publicKey => (await registration(true)).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }),
  label: () => deviceLabel(navigator.userAgent),
};

const statusOf = (problem: unknown): number | undefined => (problem as { status?: number } | null)?.status;
const textOf = (problem: unknown): string => problem instanceof Error && statusOf(problem) !== undefined && problem.message
  ? problem.message : "Notifikasi belum bisa dinyalakan di perangkat ini. Coba lagi.";
/** A promise that is let go of after a while (signing out never waits for a push service). */
const soon = <T,>(work: Promise<T>, ms: number): Promise<T | undefined> => Promise.race([work.catch(() => undefined), new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), ms))]);

/**
 * The person signs out of this device: its subscription is removed on the server and in the browser,
 * so whoever uses the device next never gets this person's notifications. Never throws, never
 * waits more than a few seconds; a subscription the server was not told about is dead anyway once
 * the browser let go of it (the next sending meets 410 and removes it).
 */
export async function dropPush(port: PushPort | null | undefined): Promise<void> {
  if (!port) return;
  try {
    if (port.device.support() !== "ok") return;
    const subscription = await soon(port.device.current(), 2_000);
    if (!subscription) return;
    await soon(port.api.remove(subscription.endpoint), 3_000);
    await soon(subscription.unsubscribe(), 2_000);
  } catch { /* nothing to remove */ }
}

/**
 * Nobody is signed in on this browser any more (Coffee's sign-in page is showing, or the app met
 * 401): a subscription that is still there belongs to whoever was signed in before, and the server
 * can no longer be told. The browser lets go of it, so the push service refuses the next sending
 * (410) and the server removes the row then (audit F5-07). Nothing is registered for this; never throws.
 */
export async function forgetLocalPush(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const found = await soon(navigator.serviceWorker.getRegistration(coffeePath.scope), 2_000);
    const subscription = found?.pushManager ? await soon(found.pushManager.getSubscription(), 2_000) : null;
    if (subscription) await soon(subscription.unsubscribe(), 2_000);
  } catch { /* nothing to let go of */ }
}

/**
 * "Nyalakan notifikasi" and "Matikan" replace each other, so the button that was pressed is gone
 * when the press is done and the focus would fall to the page (audit F5-09). `follow()` before the
 * press, `target` on whatever stands there afterwards (the other button, or the line of status):
 * once the press has settled the focus goes there.
 */
export function useFocusAfter<T extends HTMLElement = HTMLElement>(settled: boolean, state: unknown) {
  const target = useRef<T>(null);
  const wanted = useRef(false);
  useEffect(() => {
    if (!wanted.current || !settled) return;
    wanted.current = false;
    target.current?.focus({ preventScroll: true });
  }, [settled, state]);
  return { target, follow: useCallback(() => { wanted.current = true; }, []) };
}

export type PushControl = {
  state: CoffeePushState;
  /** Why the server cannot send yet (state "not-ready"). */
  waiting: CoffeePushWaiting;
  busy: boolean;
  /** What went wrong the last time something was pressed. */
  error: string;
  /** What the last press achieved ("Notifikasi tes dikirim."). */
  message: string;
  /** Asks for permission and subscribes this device. "unsupported": it cannot be turned on here (the state says why). */
  enable(): Promise<"granted" | "denied" | "unsupported">;
  disable(): Promise<void>;
  /** Sends a test to the person's own devices, where the API has one. */
  test?: () => Promise<void>;
};

/** `port` null: push is not part of this screen (a test, a preview without it). `paused`: nothing is asked or registered (a guest holds the tablet). */
export function usePush(port: PushPort | null, paused = false): PushControl {
  const [state, setState] = useState<CoffeePushState>("checking");
  const [waiting, setWaiting] = useState<CoffeePushWaiting>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const key = useRef<string | null>(null);
  const working = useRef(false);
  /** Something was pressed: what the first look finds afterwards no longer decides the state. */
  const touched = useRef(false);

  useEffect(() => {
    if (!port || paused) return;
    let live = true;
    const { api, device } = port;
    (async () => {
      let next: CoffeePushState = "off";
      try {
        const support = device.support();
        if (support !== "ok") next = support;
        else {
          const info = await api.info();
          key.current = info.publicKey;
          if (live) setWaiting(info.waiting);
          if (!info.publicKey) next = "not-ready";
          else if (device.permission() === "denied") next = "denied";
          else {
            const existing = device.permission() === "granted" ? await device.current() : null;
            if (existing) {
              // In step with the server, and with whoever is signed in now (the device may have changed hands).
              await api.save(existing.toJSON(), device.label()).catch(() => undefined);
              next = "on";
            }
          }
        }
      } catch (problem) {
        next = statusOf(problem) === 409 ? "account" : "off";
      }
      if (live && !touched.current) setState(next);
    })();
    return () => { live = false; };
  }, [port, paused]);

  const enable = useCallback(async (): Promise<"granted" | "denied" | "unsupported"> => {
    if (!port || working.current) return "unsupported";
    const { api, device } = port;
    working.current = true;
    touched.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      const support = device.support();
      if (support !== "ok") { setState(support); return "unsupported"; }
      if (!key.current) {
        const info = await api.info();
        key.current = info.publicKey;
        setWaiting(info.waiting);
        if (!info.publicKey) { setState("not-ready"); return "unsupported"; }
      }
      const permission = await device.ask();
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return "denied"; }
      const publicKey = key.current;
      if (!publicKey) { setState("not-ready"); return "unsupported"; }
      const subscription = (await device.current()) ?? await device.subscribe(publicKey);
      await api.save(subscription.toJSON(), device.label());
      setState("on");
      return "granted";
    } catch (problem) {
      if (statusOf(problem) === 409) { setState("account"); return "unsupported"; }
      setError(textOf(problem));
      return "unsupported";
    } finally {
      working.current = false;
      setBusy(false);
    }
  }, [port]);

  const disable = useCallback(async () => {
    if (!port || working.current) return;
    working.current = true;
    touched.current = true;
    setBusy(true); setError(""); setMessage("");
    await dropPush(port);
    setState("off");
    working.current = false;
    setBusy(false);
  }, [port]);

  const send = port?.api.test;
  const test = useCallback(async () => {
    if (!send || working.current) return;
    working.current = true;
    setBusy(true); setError(""); setMessage("");
    // The server does not say whether the push service took it (audit F5-04), so the words cover both.
    try { setMessage(`${await send()} Bila tidak muncul dalam beberapa detik, matikan lalu nyalakan lagi notifikasi di perangkat ini.`); }
    catch (problem) { setError(statusOf(problem) !== undefined && problem instanceof Error ? problem.message : "Notifikasi tes belum terkirim. Coba lagi."); }
    working.current = false;
    setBusy(false);
  }, [send]);

  return { state, waiting, busy, error, message, enable, disable, test: send ? test : undefined };
}

/** What the service worker tells an open page: something was pushed (read again), or a notification was tapped (go there). */
export type WorkerNews = { type: "push" } | { type: "open"; url: string };

/** Listens to Coffee's service worker while `on`. The handler may change freely; it is not re-subscribed for that. */
export function useWorkerNews(handler: (news: WorkerNews) => void, on = true): void {
  const latest = useRef(handler);
  useEffect(() => { latest.current = handler; }, [handler]);
  useEffect(() => {
    if (!on || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    const hear = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (data?.type === "coffee:push") latest.current({ type: "push" });
      // Only an address of this site, as a path: the page decides what it opens.
      else if (data?.type === "coffee:open" && typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//")) latest.current({ type: "open", url: data.url });
    };
    container.addEventListener("message", hear);
    return () => container.removeEventListener("message", hear);
  }, [on]);
}

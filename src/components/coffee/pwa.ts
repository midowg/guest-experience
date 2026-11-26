"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { coffeePath } from "@/lib/routes";

/*
 * WG Coffee as an app on the phone: registers its own service worker (public/coffee/sw.js,
 * scope /coffee, so the first page is controlled too), keeps the browser's install offer for
 * "Pasang sekarang", and knows whether the app already runs from the home screen.
 *
 * Web push (F4, usePush.ts) subscribes on this one registration: `coffeeWorker()` answers with it
 * (null where service workers do not exist) and may be called from anywhere, any number of times.
 * The employee app calls it through usePwa, GA's tablet in GaApp (not while a guest holds it), and
 * the pengelola's admin (outside the scope, which a subscription does not need) when its device
 * is asked about notifications. Subscribing waits for the worker to be active (`activeCoffeeWorker`).
 */

let worker: Promise<ServiceWorkerRegistration | null> | null = null;
/** Registers the app's service worker once per page load and answers with its registration. Never throws. */
export function coffeeWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return Promise.resolve(null);
  worker ??= (async () => {
    try {
      // Before the F2 audit the scope was /coffee/ (the first page left out). A device that still has that
      // registration lets go of it, or it would keep winning for every page under /coffee/.
      const old = await navigator.serviceWorker.getRegistration(coffeePath.oldScope);
      if (old && new URL(old.scope).pathname === coffeePath.oldScope) await old.unregister();
      return await navigator.serviceWorker.register(coffeePath.serviceWorker, { scope: coffeePath.scope });
    } catch {
      worker = null;
      return null;
    }
  })();
  return worker;
}
/** How long "Nyalakan notifikasi" waits for a worker that was registered just now to become active. */
export const WORKER_READY_MS = 10_000;
/**
 * The registration once its worker is active (audit F5-03). register() answers while the worker is
 * still installing, and pushManager.subscribe() refuses until one is active: on a browser that
 * never opened /coffee (the pengelola's admin, outside the scope) the first press would fail and
 * only the second work. navigator.serviceWorker.ready cannot be used for it: it never settles on
 * a page outside the scope. So the worker's own state is watched, for a while at most; after that
 * the caller goes on and fails in the open. Never throws.
 */
export async function activeCoffeeWorker(ms = WORKER_READY_MS): Promise<ServiceWorkerRegistration | null> {
  const found = await coffeeWorker();
  if (!found || found.active) return found;
  const pending = found.installing ?? found.waiting;
  if (!pending) return found;
  await new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); pending.removeEventListener("statechange", check); resolve(); };
    const check = () => { if (pending.state === "activated" || pending.state === "redundant") done(); };
    const timer = setTimeout(done, ms);
    pending.addEventListener("statechange", check);
    check();
  });
  return found;
}
/** For tests only. */
export const forgetCoffeeWorker = () => { worker = null; };

type InstallOffer = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
/** Chrome's offer to install, kept until the person presses "Pasang sekarang". */
let offer: InstallOffer | null = null;

const STANDALONE = "(display-mode: standalone)";
const standaloneNow = () => !!window.matchMedia?.(STANDALONE).matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
function subscribeStandalone(listener: () => void) {
  const query = window.matchMedia?.(STANDALONE);
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

/** `live`: the real app at its own addresses (the preview and the tests register nothing). */
export function usePwa(live: boolean) {
  useEffect(() => {
    if (!live) return;
    void coffeeWorker();
    const keep = (event: Event) => { event.preventDefault(); offer = event as InstallOffer; };
    window.addEventListener("beforeinstallprompt", keep);
    return () => window.removeEventListener("beforeinstallprompt", keep);
  }, [live]);
  /** Already opened from the home screen (false while the server draws the page). */
  const installed = useSyncExternalStore(subscribeStandalone, standaloneNow, () => false);
  /** Shows the browser's own install question; false when the browser offered none. */
  const install = useCallback(async (): Promise<boolean> => {
    const kept = offer;
    if (!kept) return false;
    offer = null;
    await kept.prompt();
    await kept.userChoice.catch(() => null);
    return true;
  }, []);
  return { installed, install };
}

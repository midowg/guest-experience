"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { coffeePath } from "@/lib/routes";

/*
 * Werkudara Coffee as an app on the phone: registers its own service worker (public/coffee/sw.js,
 * scope /coffee/), keeps the browser's install offer for "Pasang sekarang", and knows whether the
 * app already runs from the home screen. Web push (F4) subscribes on this same registration.
 */

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
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(coffeePath.serviceWorker, { scope: coffeePath.scope }).catch(() => undefined);
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

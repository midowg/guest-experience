"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { flushedText } from "@/lib/main-wam/momen/stack";
import { useToast } from "@/components/main-wam/ui";
import { momenQueue } from "./sender";

/** The queue as the UI sees it (counts, items, the one being sent); updates as it changes. */
export function useMomenQueue() {
  const queue = momenQueue();
  return useSyncExternalStore(queue.subscribe, queue.snapshot, queue.snapshot);
}

/** How often the sender looks again while the app is open (iPhone has no Background Sync). */
const LOOK_EVERY_MS = 30_000;
let owner: symbol | null = null;

/**
 * Keeps the phone's queue moving (U03): wakes it when the app opens, comes back to the front, or
 * gets its signal back, and every 30 seconds; tells "2 foto terkirim" when photos that waited are
 * sent (on any screen it is mounted on: Beranda, Momen, Kamera, Galeri, Mozaik). Mounted twice, only
 * the first one speaks. Draws nothing.
 */
export function MomenQueueRunner() {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; });

  useEffect(() => {
    const me = Symbol("runner");
    if (owner) return;
    owner = me;
    const queue = momenQueue();
    let flushed = 0;
    let tell: ReturnType<typeof setTimeout> | null = null;
    const offEvents = queue.onEvent(event => {
      if (event.type === "sent" && event.item.deferred) {
        flushed += 1;
        if (tell) clearTimeout(tell);
        tell = setTimeout(() => { toastRef.current.show({ text: flushedText(flushed), tone: "success" }); flushed = 0; }, 1200);
      }
      if (event.type === "failed") {
        toastRef.current.show({ text: "Foto belum terkirim", sub: event.item.error ?? undefined, tone: "error", action: { label: "Coba lagi", onAction: () => { void queue.retry(event.item.clientId); } } });
      }
      if (event.type === "masuk") {
        toastRef.current.show({ text: "Sesi berakhir", sub: "Masuk lagi untuk mengirim foto yang antre.", tone: "error", action: { label: "Masuk", onAction: () => window.location.reload() } });
      }
    });
    const wake = () => { queue.refresh(); void queue.wake(); };
    const offline = () => queue.refresh();
    const look = () => { if (document.visibilityState === "visible") void queue.flush(); };
    void queue.wake();
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    window.addEventListener("pageshow", wake);
    document.addEventListener("visibilitychange", look);
    const timer = window.setInterval(look, LOOK_EVERY_MS);
    return () => {
      offEvents();
      if (tell) clearTimeout(tell);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", offline);
      window.removeEventListener("pageshow", wake);
      document.removeEventListener("visibilitychange", look);
      window.clearInterval(timer);
      if (owner === me) owner = null;
    };
  }, []);
  return null;
}

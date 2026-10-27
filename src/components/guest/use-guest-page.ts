"use client";

import { useEffect } from "react";
import type { EventRecord } from "@/lib/types";
import { guestApi, guestServiceWorker } from "@/lib/routes";

/** What every guest page does in the background: the offline copy and counting a personal link's opening. */
export function useGuestPage(event: EventRecord, preview: boolean, invitation?: { token: string }) {
  // Keeps the last copy of this guest page for offline use (trips with weak signal). Production only.
  useEffect(() => {
    if (preview || process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(guestServiceWorker.url, { scope: guestServiceWorker.scope }).catch(() => {});
    // Phones that opened an older invitation still hold a worker limited to /e/; one is enough.
    void navigator.serviceWorker.getRegistrations().then(list => list.filter(item => new URL(item.scope).pathname === guestServiceWorker.legacyScope).forEach(item => void item.unregister())).catch(() => {});
  }, [preview]);
  // Counts the opening of a personal link once per browser session. Never in the admin preview.
  const openedToken = !preview && invitation ? invitation.token : null;
  useEffect(() => {
    if (!openedToken) return;
    const key = `wk_opened_${openedToken.slice(0, 16)}`;
    try { if (window.sessionStorage.getItem(key)) return; window.sessionStorage.setItem(key, "1"); } catch { /* storage blocked: still count */ }
    void fetch(guestApi.opened(event, openedToken), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", keepalive: true }).catch(() => {});
  }, [openedToken, event]);
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { deviceLabel, keyBytes, pushSupport } from "@/lib/pra-wam/push";
import { PRA_WAM_PATH, praWamApi } from "@/lib/routes";
import { failText, mwRequest } from "./request";

/*
 * Notifikasi di HP for Main WAM (O03, S02): the same Web Push as Pra WAM's PushSwitch (one service
 * worker under /wam/, the same API and the same subscription), without Pra WAM's per-topic switches,
 * which S02 dropped (revisi 16 Nov malam). The permission is only asked from a tap (iOS needs a user
 * gesture; RISET §5); an iPhone outside the installed app gets the install guide instead, since
 * PushManager does not exist in a Safari tab.
 */

export type PushState = "checking" | "unsupported" | "ios-install" | "not-ready" | "denied" | "off" | "on";

const SCOPE = `${PRA_WAM_PATH}/`;

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration(SCOPE)) ?? navigator.serviceWorker.register(`${PRA_WAM_PATH}/sw.js`, { scope: SCOPE });
}

/** Opened from its icon (installed), not in a browser tab. */
export function isStandalone(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

/** `preview`: a fixed state, nothing asked of the phone or the server (dev-preview pages). */
export function usePushDevice({ preview }: { preview?: PushState } = {}) {
  const [state, setState] = useState<PushState>(preview ?? "checking");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (preview) return;
    let live = true;
    (async () => {
      const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const support = pushSupport({ userAgent: navigator.userAgent, standalone: isStandalone(), hasPush });
      if (support !== "ok") { if (live) setState(support); return; }
      try {
        const { data } = await mwRequest<{ publicKey: string | null }>(praWamApi.push);
        if (!live) return;
        if (!data.publicKey) { setState("not-ready"); return; }
        setPublicKey(data.publicKey);
        const existing = await (await registration()).pushManager.getSubscription();
        if (existing) {
          // Keep the server's list in step with this phone (it may have been removed there).
          await mwRequest(praWamApi.push, { method: "POST", json: { subscription: existing.toJSON(), device: deviceLabel(navigator.userAgent) } }).catch(() => undefined);
          if (live) setState("on");
        } else if (live) setState(Notification.permission === "denied" ? "denied" : "off");
      } catch {
        if (live) setState("off");
      }
    })();
    return () => { live = false; };
  }, [preview]);

  /** Asks the phone (only from a tap) and subscribes. True when notifications are on. */
  const enable = useCallback(async (): Promise<boolean> => {
    if (!publicKey) return false;
    setBusy(true); setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return false; }
      const reg = await registration();
      const subscription = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      await mwRequest(praWamApi.push, { method: "POST", json: { subscription: subscription.toJSON(), device: deviceLabel(navigator.userAgent) } });
      setState("on");
      setMessage({ tone: "success", text: "Notifikasi aktif di HP ini." });
      return true;
    } catch (problem) {
      setMessage({ tone: "error", text: problem instanceof Error && problem.name !== "MwRequestError" ? "HP ini menolak notifikasi. Coba lagi, atau periksa izin notifikasi WAM." : failText(problem) });
      return false;
    } finally { setBusy(false); }
  }, [publicKey]);

  const disable = useCallback(async () => {
    setBusy(true); setMessage(null);
    try {
      const subscription = await (await registration()).pushManager.getSubscription();
      if (subscription) {
        await mwRequest(praWamApi.push, { method: "DELETE", json: { endpoint: subscription.endpoint } }).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (problem) { setMessage({ tone: "error", text: failText(problem) }); }
    finally { setBusy(false); }
  }, []);

  const test = useCallback(async () => {
    setBusy(true); setMessage(null);
    try {
      await mwRequest(praWamApi.pushTest, { method: "POST" });
      setMessage({ tone: "success", text: "Terkirim. Notifikasinya muncul dalam beberapa detik." });
    } catch (problem) { setMessage({ tone: "error", text: failText(problem) }); }
    finally { setBusy(false); }
  }, []);

  return { state, busy, message, enable, disable, test };
}

/** Pengaturan's pill for a state: "Aktif", "Mati", "Diblokir", "Pasang dulu", … */
export const pushWords: Record<PushState, { pill: string; tone: "success" | "neutral" | "warning" }> = {
  checking: { pill: "Memeriksa", tone: "neutral" },
  on: { pill: "Aktif", tone: "success" },
  off: { pill: "Mati", tone: "neutral" },
  denied: { pill: "Diblokir", tone: "warning" },
  "ios-install": { pill: "Pasang dulu", tone: "warning" },
  unsupported: { pill: "Tidak didukung", tone: "neutral" },
  "not-ready": { pill: "Belum siap", tone: "neutral" },
};

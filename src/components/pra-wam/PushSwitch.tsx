"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff, Info } from "lucide-react";
import { Button } from "@/components/ui";
import { deviceLabel, keyBytes, pushSupport } from "@/lib/pra-wam/push";
import { PRA_WAM_PATH, praWamApi } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import own from "./akun.module.css";
import styles from "./pra-wam.module.css";

type State = "checking" | "unsupported" | "ios-install" | "not-ready" | "denied" | "off" | "on";

const SCOPE = `${PRA_WAM_PATH}/`;

/** WAM's service worker (registered by PwaRegister); registered here too if it is not yet. */
async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration(SCOPE)) ?? navigator.serviceWorker.register(`${PRA_WAM_PATH}/sw.js`, { scope: SCOPE });
}

const text: Record<Exclude<State, "checking">, { title: string; note: string }> = {
  "on": { title: "Aktif di HP ini", note: "Pengumuman dan kabar sesi muncul di HP walau aplikasi tertutup." },
  "off": { title: "Belum aktif di HP ini", note: "Aktifkan supaya pengumuman dan kabar sesi muncul di HP." },
  "denied": { title: "Diblokir", note: "Izinkan notifikasi untuk WAM di pengaturan HP atau browser, lalu muat ulang halaman ini." },
  "ios-install": { title: "Buka dari layar utama", note: "Di iPhone, tambahkan WAM ke layar utama (Bagikan → Tambah ke Layar Utama), buka dari ikonnya, lalu aktifkan di sini." },
  "unsupported": { title: "Tidak didukung", note: "Browser ini belum mendukung notifikasi. Coba Chrome di Android, atau WAM dari layar utama iPhone." },
  "not-ready": { title: "Belum disiapkan", note: "Notifikasi HP belum disiapkan di server. Hubungi admin WAM." },
};

/**
 * Notifikasi di HP (8 Nov 2026), in Pengaturan: turns Web Push on or off for this phone, and sends
 * a test. The in-app list (the bell) works either way; this only adds the phone's own banner.
 */
export function PushSwitch() {
  const [state, setState] = useState<State>("checking");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const support = pushSupport({ userAgent: navigator.userAgent, standalone, hasPush });
      if (support !== "ok") { if (live) setState(support); return; }
      try {
        const { data } = await praWamRequest<{ publicKey: string | null }>(praWamApi.push);
        if (!live) return;
        if (!data.publicKey) { setState("not-ready"); return; }
        setPublicKey(data.publicKey);
        const existing = await (await registration()).pushManager.getSubscription();
        if (existing) {
          // Keep the server's list in step with this phone (it may have been removed there).
          await praWamRequest(praWamApi.push, { method: "POST", json: { subscription: existing.toJSON(), device: deviceLabel(navigator.userAgent) } }).catch(() => undefined);
          if (live) setState("on");
        } else if (live) setState(Notification.permission === "denied" ? "denied" : "off");
      } catch (problem) {
        if (live) { setState("off"); setMessage({ tone: "error", text: errorText(problem) }); }
      }
    })();
    return () => { live = false; };
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true); setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return; }
      const reg = await registration();
      const subscription = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      await praWamRequest(praWamApi.push, { method: "POST", json: { subscription: subscription.toJSON(), device: deviceLabel(navigator.userAgent) } });
      setState("on");
      setMessage({ tone: "ok", text: "Notifikasi aktif. Coba Kirim tes." });
    } catch (problem) {
      setMessage({ tone: "error", text: problem instanceof Error && problem.name !== "PraWamApiError" ? "HP ini menolak notifikasi. Coba lagi, atau periksa izin notifikasi WAM." : errorText(problem) });
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMessage(null);
    try {
      const subscription = await (await registration()).pushManager.getSubscription();
      if (subscription) {
        await praWamRequest(praWamApi.push, { method: "DELETE", json: { endpoint: subscription.endpoint } }).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (problem) {
      setMessage({ tone: "error", text: errorText(problem) });
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMessage(null);
    try {
      const { message: sent } = await praWamRequest(praWamApi.pushTest, { method: "POST" });
      setMessage({ tone: "ok", text: `${sent} Notifikasinya muncul dalam beberapa detik.` });
    } catch (problem) {
      setMessage({ tone: "error", text: errorText(problem) });
    } finally { setBusy(false); }
  }

  const shown = state === "checking" ? { title: "Memeriksa…", note: "Melihat apakah HP ini bisa menerima notifikasi." } : text[state];
  return <>
    <div className={own.group}>
      <div className={own.pushRow}>
        <span className={`${styles.tile} ${state === "on" ? "" : styles.tileBrass}`} aria-hidden>{state === "on" ? <BellRing /> : <BellOff />}</span>
        <span className={own.rowText} role="status">
          <strong>{shown.title}</strong>
          <small>{shown.note}</small>
        </span>
      </div>
      {(state === "off" || state === "on") && <div className={own.pushActions}>
        {state === "off" && <Button type="button" onClick={enable} disabled={busy}>{busy ? "Mengaktifkan…" : "Aktifkan notifikasi"}</Button>}
        {state === "on" && <>
          <Button type="button" variant="secondary" onClick={test} disabled={busy}>Kirim tes</Button>
          <Button type="button" variant="quiet" onClick={disable} disabled={busy}>Matikan</Button>
        </>}
      </div>}
    </div>
    {message && <p className={own.groupNote} role={message.tone === "error" ? "alert" : "status"}><Info aria-hidden />{message.text}</p>}
  </>;
}

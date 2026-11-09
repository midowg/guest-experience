"use client";

import { useEffect, useState } from "react";
import { BellRing, BellOff, Info, Send } from "lucide-react";
import { PUSH_TOPICS, deviceLabel, keyBytes, pushSupport, pushTopicInfo, resolvePrefs, type PushTopic } from "@/lib/pra-wam/push";
import { PRA_WAM_PATH, praWamApi } from "@/lib/routes";
import { PraWamApiError, errorText, praWamRequest } from "./api";
import own from "./akun.module.css";
import styles from "./pra-wam.module.css";

type State = "checking" | "unsupported" | "ios-install" | "not-ready" | "denied" | "off" | "on";

const SCOPE = `${PRA_WAM_PATH}/`;

/** WAM's service worker (registered by PwaRegister); registered here too if it is not yet. */
async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration(SCOPE)) ?? navigator.serviceWorker.register(`${PRA_WAM_PATH}/sw.js`, { scope: SCOPE });
}

const text: Record<Exclude<State, "checking">, { title: string; note: string }> = {
  "on": { title: "Aktif di HP ini", note: "Aktif di HP ini." },
  "off": { title: "Belum aktif di HP ini", note: "Nyalakan supaya kabar penting muncul di HP." },
  "denied": { title: "Diblokir", note: "Diblokir. Izinkan notifikasi WAM di pengaturan HP, lalu buka ulang halaman ini." },
  "ios-install": { title: "Buka dari layar utama", note: "Di iPhone: Bagikan → Tambah ke Layar Utama, lalu buka WAM dari ikonnya." },
  "unsupported": { title: "Tidak didukung", note: "Browser ini belum mendukung. Pakai Chrome di Android, atau WAM dari layar utama iPhone." },
  "not-ready": { title: "Belum disiapkan", note: "Belum disiapkan di server. Hubungi admin WAM." },
};

/**
 * Notifikasi di HP (8 Nov 2026), in Pengaturan: turns Web Push on or off for this phone, and sends
 * a test. The in-app list (the bell) works either way; this only adds the phone's own banner.
 */
export function PushSwitch({ hod = false }: { hod?: boolean }) {
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

  const shown = state === "checking" ? { title: "Notifikasi di HP", note: "Memeriksa HP ini…" } : { title: "Notifikasi di HP", note: text[state].note };
  const on = state === "on";
  const usable = state === "on" || state === "off";
  return <>
    <div className={own.group}>
      {/* One row with a switch, as in a phone's settings; the note under the name says why it cannot be turned on. */}
      <div className={own.pushRow}>
        <span className={`${styles.tile} ${on ? "" : styles.tileBrass}`} aria-hidden>{on ? <BellRing /> : <BellOff />}</span>
        <span className={own.rowText}>
          <strong id="push-label">{shown.title}</strong>
          <small id="push-note" role="status">{shown.note}</small>
        </span>
        <button type="button" role="switch" aria-checked={on} aria-labelledby="push-label" aria-describedby="push-note"
          className={own.switch} disabled={!usable || busy} onClick={() => on ? disable() : enable()}>
          <span className={own.switchKnob} aria-hidden />
        </button>
      </div>
      {on && <button type="button" className={`${own.rowButton} ${own.rowDivided}`} onClick={test} disabled={busy}>
        <span className={styles.tile} aria-hidden><Send /></span>
        <span className={own.rowText}><strong>Kirim notifikasi tes</strong><small>Pastikan notifikasi muncul di HP ini</small></span>
      </button>}
    </div>
    {message && <p className={own.groupNote} role={message.tone === "error" ? "alert" : "status"}><Info aria-hidden />{message.text}</p>}
    {on && <PushTopics hod={hod} />}
  </>;
}

type Prefs = Record<PushTopic, boolean>;

/**
 * Yang dikirim ke HP (8 Nov 2026): one switch per topic, saved as soon as it is flipped. Until the
 * database has the table (503) the list shows the defaults, read-only; the main switch is untouched.
 * Grouped (9 Nov 2026): what everyone gets, then Khusus HOD for a HOD only; peserta and panitia
 * have nothing of their own, so they see the first group alone.
 */
export function PushTopics({ hod = false }: { hod?: boolean }) {
  const [prefs, setPrefs] = useState<Prefs>(() => resolvePrefs({}));
  const [status, setStatus] = useState<"loading" | "ready" | "pending-db" | "failed">("loading");
  const [saving, setSaving] = useState<PushTopic[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    praWamRequest<{ prefs: Prefs; topics: PushTopic[] }>(praWamApi.pushPrefs).then(({ data }) => {
      if (!live) return;
      setPrefs(resolvePrefs(data.prefs));
      setStatus("ready");
    }).catch((problem: unknown) => {
      if (!live) return;
      if (problem instanceof PraWamApiError && problem.status === 503) { setStatus("pending-db"); return; }
      setStatus("failed");
      setError(errorText(problem));
    });
    return () => { live = false; };
  }, []);

  async function toggle(topic: PushTopic) {
    const next = !prefs[topic];
    // Optimistic: the switch moves now and goes back if the server says no.
    setPrefs(current => ({ ...current, [topic]: next }));
    setSaving(current => [...current, topic]);
    setError(null);
    try {
      const { data } = await praWamRequest<{ prefs: Partial<Prefs> }>(praWamApi.pushPrefs, { method: "PUT", json: { prefs: { [topic]: next } } });
      // Only this topic: another switch may still be on its way to the server.
      setPrefs(current => ({ ...current, [topic]: data?.prefs?.[topic] ?? next }));
    } catch (problem) {
      setPrefs(current => ({ ...current, [topic]: !next }));
      setError(errorText(problem));
    } finally {
      setSaving(current => current.filter(item => item !== topic));
    }
  }

  const editable = status === "ready";
  const row = (topic: PushTopic) => {
    const info = pushTopicInfo[topic];
    return <li key={topic} className={own.topicRow}>
      <span className={own.rowText}>
        <strong id={`push-topic-${topic}`}>{info.label}</strong>
        <small id={`push-topic-${topic}-hint`}>{info.hint}</small>
      </span>
      {info.locked
        ? <span className={`${styles.pill} ${styles.pillLine} ${own.topicPill}`}>Selalu</span>
        : <button type="button" role="switch" aria-checked={prefs[topic]} aria-labelledby={`push-topic-${topic}`} aria-describedby={`push-topic-${topic}-hint`}
          className={`${own.switch} ${own.switchSmall}`} disabled={!editable || saving.includes(topic)} onClick={() => toggle(topic)}>
          <span className={own.switchKnob} aria-hidden />
        </button>}
    </li>;
  };
  const groups = [
    { id: "push-topics", title: "Yang dikirim ke HP", topics: PUSH_TOPICS.filter(topic => !pushTopicInfo[topic].only) },
    ...(hod ? [{ id: "push-topics-hod", title: "Khusus HOD", topics: PUSH_TOPICS.filter(topic => pushTopicInfo[topic].only === "hod") }] : []),
  ];
  return <div className={own.topics}>
    {groups.map(group => <section key={group.id} className={own.topicGroup} aria-labelledby={group.id}>
      <h3 id={group.id} className={own.groupTitle}>{group.title}</h3>
      <ul className={own.group} aria-labelledby={group.id} aria-busy={status === "loading"}>{group.topics.map(row)}</ul>
    </section>)}
    {status === "pending-db" && <p className={own.groupNote} role="status"><Info aria-hidden />Pilihan per topik aktif setelah pembaruan database.</p>}
    {error && <p className={own.groupNote} role="alert"><Info aria-hidden />{error}</p>}
    <p className={own.groupNote}><Info aria-hidden />Semua tetap tercatat di lonceng. Pukul 21.00–06.00 hanya yang mendesak yang dikirim ke HP.</p>
  </div>;
}

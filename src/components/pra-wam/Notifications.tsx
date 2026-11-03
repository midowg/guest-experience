"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { praWamApi, praWamPath } from "@/lib/routes";
import type { Notification, SentAnnouncement } from "@/lib/server/pra-wam/announcements";
import { errorText, praWamRequest } from "./api";
import styles from "./pra-wam.module.css";

const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

/** The person's notifications; opening one marks it read. */
export function NotificationList({ items }: { items: Notification[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const unread = items.filter(item => !item.readAt).length;
  async function read(id?: string) {
    setBusy(true);
    try { await praWamRequest(praWamApi.notifications, { method: "POST", json: id ? { id } : {} }); router.refresh(); }
    finally { setBusy(false); }
  }
  if (!items.length) return <p className={styles.meta}>Belum ada notifikasi. Pengumuman panitia dan kabar sesi muncul di sini.</p>;
  return <div className={styles.section}>
    {unread > 0 && <div><Button type="button" variant="secondary" disabled={busy} onClick={() => read()}>Tandai semua dibaca ({unread})</Button></div>}
    <div className={styles.mine}>
      {items.map(item => <article key={item.id} className={`${styles.mineItem} ${item.readAt ? "" : styles.unread}`}>
        <span className={styles.kicker}>{item.kind === "sesi" ? "Kabar sesi" : "Pengumuman"} · {when(item.createdAt)}</span>
        <h3>{item.title}</h3>
        {item.body && <p className={styles.meta} style={{ whiteSpace: "pre-line", margin: 0 }}>{item.body}</p>}
        <div className={styles.actions}>
          {item.sessionId && <a className="button button--secondary" href={praWamPath.session(item.sessionId)} onClick={() => { if (!item.readAt) void read(item.id); }}>Buka sesi</a>}
          {!item.readAt && <button type="button" className="button button--quiet" disabled={busy} onClick={() => read(item.id)}>Tandai dibaca</button>}
        </div>
      </article>)}
    </div>
  </div>;
}

type Option = { id: string; title: string };

/** Panitia writes an announcement for everyone, a session, or units, and sees who read it. */
export function AnnouncementComposer({ sent, sessions, units }: { sent: SentAnnouncement[]; sessions: Option[]; units: Option[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<"semua" | "sesi" | "unit">("semua");
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const audience = type === "sesi" ? { type, sessionId } : type === "unit" ? { type, unitIds } : { type };
  const ready = title.trim().length >= 2 && (type !== "sesi" || !!sessionId) && (type !== "unit" || unitIds.length > 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!window.confirm("Kirim pengumuman ini sekarang? Penerima langsung melihatnya di Notifikasi.")) return;
    setBusy(true); setNotice(null);
    try {
      const result = await praWamRequest(praWamApi.announcements, { method: "POST", json: { title, body, audience } });
      setTitle(""); setBody(""); setNotice({ tone: "success", text: result.message }); router.refresh();
    } catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(false); }
  }

  return <>
    <section className={styles.card} aria-labelledby="tulis">
      <h2 id="tulis">Tulis pengumuman</h2>
      <form className={styles.section} onSubmit={submit}>
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        <div><label className={styles.label} htmlFor="ann-title">Judul</label>
          <input id="ann-title" className="input" value={title} maxLength={150} onChange={event => setTitle(event.target.value)} /></div>
        <div><label className={styles.label} htmlFor="ann-body">Isi</label>
          <textarea id="ann-body" className="textarea" rows={5} maxLength={4000} value={body} onChange={event => setBody(event.target.value)} /></div>
        <div className={styles.dates} role="group" aria-label="Penerima">
          {([["semua", "Semua peserta"], ["sesi", "Peserta satu sesi"], ["unit", "Unit tertentu"]] as const).map(([value, label]) =>
            <button key={value} type="button" className={`${styles.chip} ${styles.chipSmall}`} aria-pressed={type === value} onClick={() => setType(value)}>{label}</button>)}
        </div>
        {type === "sesi" && (sessions.length ? <select className="select" aria-label="Sesi" value={sessionId} onChange={event => setSessionId(event.target.value)}>
          {sessions.map(session => <option key={session.id} value={session.id}>{session.title}</option>)}
        </select> : <p className={styles.meta}>Belum ada sesi terbit.</p>)}
        {type === "unit" && (units.length ? <div className={styles.dates} role="group" aria-label="Unit">
          {units.map(unit => <button key={unit.id} type="button" className={`${styles.chip} ${styles.chipSmall}`} aria-pressed={unitIds.includes(unit.id)}
            onClick={() => setUnitIds(unitIds.includes(unit.id) ? unitIds.filter(id => id !== unit.id) : [...unitIds, unit.id])}>{unit.title}</button>)}
        </div> : <p className={styles.meta}>Unit belum diimpor di super admin.</p>)}
        <div><Button type="submit" disabled={busy || !ready}>{busy ? "Mengirim…" : "Kirim sekarang"}</Button></div>
      </form>
    </section>
    <section className={styles.card} aria-labelledby="terkirim">
      <h2 id="terkirim">Terkirim</h2>
      {sent.length === 0 ? <p className={styles.meta}>Belum ada pengumuman.</p> : <div className={styles.mine}>
        {sent.map(item => <article key={item.id} className={styles.mineItem}>
          <span className={styles.kicker}>{when(item.createdAt)} · {item.audienceLabel}</span>
          <h3>{item.title}</h3>
          <span className={styles.meta}>Dibaca {item.read} dari {item.recipients}</span>
        </article>)}
      </div>}
    </section>
  </>;
}

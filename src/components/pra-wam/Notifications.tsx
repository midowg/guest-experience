"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeftRight, BellOff, CalendarDays, CheckCircle2, Clock, MapPin, Megaphone, Send, XCircle } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { praWamApi, praWamPath } from "@/lib/routes";
import type { Notification, SentAnnouncement } from "@/lib/server/pra-wam/announcements";
import { errorText, praWamRequest } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { ScreenHead } from "./ScreenHead";
import notes from "./akun.module.css";
import styles from "./pra-wam.module.css";

const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));

const wibDay = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const clock = (iso: string) => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const dayName = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/** The tile for a note, from what it is about (Penpot "P11"). */
function noteIcon(item: Notification): { icon: React.ReactNode; brass: boolean } {
  if (item.kind === "pengumuman") return { icon: <Megaphone aria-hidden />, brass: true };
  if (/^Jadwal berubah/.test(item.title)) return { icon: <MapPin aria-hidden />, brass: true };
  if (/^Dibatalkan/.test(item.title)) return { icon: <XCircle aria-hidden />, brass: false };
  if (/^(Disetujui|Ditolak)/.test(item.title)) return { icon: <ArrowLeftRight aria-hidden />, brass: false };
  return { icon: <CalendarDays aria-hidden />, brass: false };
}

/**
 * The person's notifications (Penpot "P11 · Notifikasi"), grouped Hari ini, Kemarin, then by day.
 * A dot marks what is unread; opening one or "Tandai dibaca" clears it.
 */
export function NotificationList({ items, now }: { items: Notification[]; now: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const unread = items.filter(item => !item.readAt).length;
  async function read(id?: string) {
    setBusy(true);
    try { await praWamRequest(praWamApi.notifications, { method: "POST", json: id ? { id } : {} }); router.refresh(); }
    finally { setBusy(false); }
  }
  const markAll = unread > 0 && <button type="button" className="button button--secondary" disabled={busy} onClick={() => read()}>Tandai semua dibaca ({unread})</button>;
  // Desktop: the title and "Tandai semua dibaca" in one row; the phone has its own back bar.
  const head = <div className={notes.deskOnly}><ScreenHead title="Notifikasi" lead="Pengumuman panitia dan kabar sesi yang kamu ikuti." actions={markAll || undefined} /></div>;
  if (!items.length) return <div className={notes.noteWrap}>{head}
    <div className={notes.empty}>
      <span className={notes.emptyMark}><BellOff aria-hidden /></span>
      <strong>Belum ada notifikasi</strong>
      <p>Pengumuman dari panitia dan kabar sesi (terbit, pindah jadwal, batal) akan muncul di sini.</p>
    </div>
  </div>;
  const today = wibDay(now);
  const yesterday = wibDay(new Date(new Date(now).getTime() - 86_400_000).toISOString());
  const days = [...new Set(items.map(item => wibDay(item.createdAt)))];
  const label = (day: string) => (day === today ? "Hari ini" : day === yesterday ? "Kemarin" : dayName(day));
  return <div className={notes.noteWrap}>
    {head}
    {markAll && <div className={`${notes.noteBar} ${notes.phoneOnly}`}>{markAll}</div>}
    {days.map(day => <section key={day} aria-label={label(day)}>
      <p className={notes.group}>{label(day)}</p>
      {items.filter(item => wibDay(item.createdAt) === day).map(item => {
        const { icon, brass } = noteIcon(item);
        return <article key={item.id} className={`${notes.note} ${item.readAt ? notes.noteRead : ""}`}>
          <span className={`${styles.tile} ${brass ? styles.tileBrass : ""}`}>{icon}</span>
          <div className={notes.noteBody}>
            <strong>{item.title}</strong>
            {item.body && <p>{item.body}</p>}
            <span className={styles.meta}>{item.kind === "sesi" ? "Kabar sesi" : "Panitia"} · {clock(item.createdAt)}</span>
            {(item.sessionId || !item.readAt) && <div className={styles.actions}>
              {item.sessionId && <a className="button button--primary" href={praWamPath.session(item.sessionId)} onClick={() => { if (!item.readAt) void read(item.id); }}>Buka sesi</a>}
              {!item.readAt && <button type="button" className="button button--quiet" disabled={busy} onClick={() => read(item.id)}>Tandai dibaca</button>}
            </div>}
          </div>
          {!item.readAt && <span className={notes.dot} aria-label="Belum dibaca" />}
        </article>;
      })}
    </section>)}
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
  /** Which sent announcement is being removed, for its busy label. */
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  async function removeSent(item: SentAnnouncement) {
    if (!(await confirm({
      title: "Hapus pengumuman?",
      body: `"${item.title}" hilang juga dari Notifikasi semua penerima dan tidak bisa dikembalikan.`,
      confirmLabel: "Hapus pengumuman",
      danger: true,
    }))) return;
    setBusy(true); setRemoving(item.id); setNotice(null);
    try { setNotice({ tone: "success", text: (await praWamRequest(praWamApi.announcement(item.id), { method: "DELETE" })).message }); router.refresh(); }
    catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(false); setRemoving(null); }
  }
  const audience = type === "sesi" ? { type, sessionId } : type === "unit" ? { type, unitIds } : { type };
  const ready = title.trim().length >= 2 && (type !== "sesi" || !!sessionId) && (type !== "unit" || unitIds.length > 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!(await confirm({
      title: "Kirim pengumuman?",
      body: `"${title.trim()}" langsung muncul di Notifikasi penerima. Setelah terkirim, isinya tidak bisa diubah.`,
      confirmLabel: "Kirim sekarang",
    }))) return;
    setBusy(true); setNotice(null);
    try {
      const result = await praWamRequest(praWamApi.announcements, { method: "POST", json: { title, body, audience } });
      setTitle(""); setBody(""); setNotice({ tone: "success", text: result.message }); router.refresh();
    } catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(false); }
  }

  return <div className={notes.annGrid}>
    {confirmDialog}
    <section className={styles.card} aria-labelledby="tulis">
      <h2 id="tulis">Tulis pengumuman</h2>
      <form className={styles.section} onSubmit={submit}>
        {notice && <div role="status"><Notice tone={notice.tone}>{notice.text}</Notice></div>}
        <div><label className={styles.label} htmlFor="ann-title">Judul</label>
          <input id="ann-title" className="input" value={title} maxLength={150} onChange={event => setTitle(event.target.value)} /></div>
        <div><label className={styles.label} htmlFor="ann-body">Isi</label>
          <textarea id="ann-body" className="textarea" rows={5} maxLength={4000} value={body} onChange={event => setBody(event.target.value)} /></div>
        <div>
          <p className={styles.label}>Penerima</p>
          <div className={styles.pills} role="group" aria-label="Penerima">
            {([["semua", "Semua peserta"], ["sesi", "Peserta satu sesi"], ["unit", "Per departemen atau BU"]] as const).map(([value, label]) =>
              <button key={value} type="button" className={`${styles.chip} ${styles.chipSmall}`} aria-pressed={type === value} onClick={() => setType(value)}>{label}</button>)}
          </div>
        </div>
        {type === "sesi" && (sessions.length ? <select className="select" aria-label="Sesi" value={sessionId} onChange={event => setSessionId(event.target.value)}>
          {sessions.map(session => <option key={session.id} value={session.id}>{session.title}</option>)}
        </select> : <p className={styles.meta}>Belum ada sesi terbit.</p>)}
        {type === "unit" && (units.length ? <div className={styles.pills} role="group" aria-label="Unit">
          {units.map(unit => <button key={unit.id} type="button" className={`${styles.chip} ${styles.chipSmall}`} aria-pressed={unitIds.includes(unit.id)}
            onClick={() => setUnitIds(unitIds.includes(unit.id) ? unitIds.filter(id => id !== unit.id) : [...unitIds, unit.id])}>{unit.title}</button>)}
        </div> : <p className={styles.meta}>Unit belum diimpor di admin WAM.</p>)}
        <p className={notes.annHint}>Terkirim sekarang ke menu Notifikasi penerima.</p>
        <div><Button type="submit" disabled={busy || !ready}><Send size={18} aria-hidden /> {busy ? "Mengirim…" : "Kirim sekarang"}</Button></div>
      </form>
    </section>
    <section className={styles.card} aria-labelledby="terkirim">
      <h2 id="terkirim">Sudah dikirim</h2>
      {sent.length === 0 ? <div className={styles.emptyRow}>
        <span className={styles.tile} aria-hidden><Megaphone /></span>
        <p>Belum ada pengumuman. Pengumuman yang kamu kirim muncul di sini.</p>
      </div> : <div className={notes.sentList}>
        {sent.map(item => {
          const all = item.recipients > 0 && item.read === item.recipients;
          return <article key={item.id} className={notes.sentRow}>
            <div><strong>{item.title}</strong><small>{item.audienceLabel} · {when(item.createdAt)}</small></div>
            <span className={`${styles.pill} ${all ? styles.pillSuccess : ""} ${notes.readPill}`}>{all ? <CheckCircle2 aria-hidden /> : <Clock aria-hidden />}{item.read} / {item.recipients} dibaca</span>
            <button type="button" className={`button button--quiet ${styles.dangerQuiet}`} disabled={busy} aria-label={`Hapus pengumuman ${item.title}`} onClick={() => removeSent(item)}>{removing === item.id ? "Menghapus…" : "Hapus"}</button>
          </article>;
        })}
      </div>}
    </section>
  </div>;
}

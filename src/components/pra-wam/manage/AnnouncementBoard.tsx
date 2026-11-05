"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Megaphone, PenLine, Send, X } from "lucide-react";
import { ConsoleButton, PageHeader, Pill, SectionToolbar } from "@/components/console";
import cs from "@/components/console/console.module.css";
import { Notice } from "@/components/ui";
import { praWamApi } from "@/lib/routes";
import type { SentAnnouncement } from "@/lib/server/pra-wam/announcements";
import { errorText, praWamRequest } from "../api";
import { useConfirm } from "../ConfirmDialog";
import styles from "../panitia.module.css";

type Option = { id: string; title: string };
const when = (iso: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso));
const audiences = [["semua", "Semua peserta"], ["sesi", "Peserta satu sesi"], ["unit", "Per departemen atau BU"]] as const;

/**
 * Pengumuman (console "K6"): what was sent, newest first, each with its text, its recipients and
 * how many have read it; "Tulis pengumuman" opens the form. Sending asks once more (it cannot be
 * changed afterwards), and removing one takes it out of everyone's Notifikasi. Every announcement
 * goes out at once, so there is no Terjadwal or Draf.
 */
export function AnnouncementBoard({ sent, sessions, units, lead }: { sent: SentAnnouncement[]; sessions: Option[]; units: Option[]; lead: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  /** Where the focus was before the form opened, to go back to when it closes. */
  const opener = useRef<HTMLElement | null>(null);
  const [writing, setWriting] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<"semua" | "sesi" | "unit">("semua");
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  /** Which sent announcement is being removed, for its busy label. */
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (writing && !element.open) element.showModal?.();
    if (!writing && element.open) { element.close(); opener.current?.focus(); }
  }, [writing]);

  const audience = type === "sesi" ? { type, sessionId } : type === "unit" ? { type, unitIds } : { type };
  const ready = title.trim().length >= 2 && (type !== "sesi" || !!sessionId) && (type !== "unit" || unitIds.length > 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!(await confirm({
      title: "Kirim pengumuman?",
      body: `"${title.trim()}" langsung muncul di Notifikasi penerima. Setelah terkirim, isinya tidak bisa diubah.`,
      confirmLabel: "Kirim sekarang",
    }))) return;
    setBusy(true); setNotice(null); setFormError(null);
    try {
      const result = await praWamRequest(praWamApi.announcements, { method: "POST", json: { title, body, audience } });
      setTitle(""); setBody(""); setWriting(false); setNotice({ tone: "success", text: result.message }); router.refresh();
    } catch (problem) { setFormError(errorText(problem)); }
    finally { setBusy(false); }
  }
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

  return <>
    {confirmDialog}
    <PageHeader title="Pengumuman" subtitle={lead}
      actions={<ConsoleButton variant="primary" icon={<PenLine size={18} aria-hidden />} aria-haspopup="dialog" onClick={event => { opener.current = event.currentTarget; setFormError(null); setWriting(true); }}>Tulis pengumuman</ConsoleButton>} />
    {notice && <div role="status"><Notice tone={notice.tone}>{notice.text}</Notice></div>}

    <section className={styles.section} aria-labelledby="terkirim">
      <SectionToolbar title={<span id="terkirim">Terkirim</span>} count={sent.length} />
      {sent.length === 0 ? <p className={styles.empty}><Megaphone size={16} aria-hidden /> Belum ada pengumuman. Pengumuman yang kamu kirim muncul di sini.</p>
        : <ul className={styles.annList}>{sent.map(item => {
          const all = item.recipients > 0 && item.read === item.recipients;
          const share = item.recipients ? Math.round((item.read / item.recipients) * 100) : 0;
          return <li key={item.id}>
            <article className={styles.annCard} aria-labelledby={`ann-${item.id}`}>
              <div className={styles.annHead}>
                <h3 id={`ann-${item.id}`}>{item.title}</h3>
                <Pill tone={all ? "ok" : "neutral"}>{item.read} / {item.recipients} dibaca</Pill>
              </div>
              {item.body && <p className={styles.annBody}>{item.body}</p>}
              <div className={styles.annMeta}>
                <span>{item.audienceLabel} · {item.recipients} penerima · {when(item.createdAt)}</span>
                <span className={styles.toolGroup}>
                  <span className={styles.annRead} aria-hidden="true"><span className={styles.annBar}><span style={{ width: `${share}%` }} /></span></span>
                  <button type="button" className={styles.dangerQuiet} disabled={busy} aria-label={`Hapus pengumuman ${item.title}`} onClick={() => removeSent(item)}>{removing === item.id ? "Menghapus…" : "Hapus"}</button>
                </span>
              </div>
            </article>
          </li>;
        })}</ul>}
    </section>

    <dialog ref={dialog} className={styles.compose} aria-labelledby="tulis"
      onCancel={event => { event.preventDefault(); if (!busy) setWriting(false); }}
      onClick={event => { if (event.target === dialog.current && !busy) setWriting(false); }}>
      {writing && <form className={styles.composeBody} onSubmit={submit}>
        <div className={styles.composeHead}>
          <h2 id="tulis">Tulis pengumuman</h2>
          <button type="button" className={styles.composeClose} aria-label="Tutup" disabled={busy} onClick={() => setWriting(false)}><X size={22} aria-hidden /></button>
        </div>
        <div className={styles.field}><label htmlFor="ann-title">Judul</label>
          <input id="ann-title" className={styles.fieldInput} value={title} maxLength={150} onChange={event => setTitle(event.target.value)} /></div>
        <div className={styles.field}><label htmlFor="ann-body">Isi</label>
          <textarea id="ann-body" className={styles.fieldInput} rows={5} maxLength={4000} value={body} onChange={event => setBody(event.target.value)} /></div>
        <div className={styles.field}>
          <p className={styles.fieldLabel} id="ann-who">Penerima</p>
          <div className={cs.chips} role="group" aria-labelledby="ann-who">
            {audiences.map(([value, label]) => <button key={value} type="button" className={cs.chip} aria-pressed={type === value} onClick={() => setType(value)}>{label}</button>)}
          </div>
        </div>
        {type === "sesi" && (sessions.length ? <select className={styles.fieldInput} aria-label="Sesi" value={sessionId} onChange={event => setSessionId(event.target.value)}>
          {sessions.map(session => <option key={session.id} value={session.id}>{session.title}</option>)}
        </select> : <p className={styles.hint}>Belum ada sesi terbit.</p>)}
        {type === "unit" && (units.length ? <div className={cs.chips} role="group" aria-label="Unit">
          {units.map(unit => <button key={unit.id} type="button" className={cs.chip} aria-pressed={unitIds.includes(unit.id)}
            onClick={() => setUnitIds(unitIds.includes(unit.id) ? unitIds.filter(id => id !== unit.id) : [...unitIds, unit.id])}>{unit.title}</button>)}
        </div> : <p className={styles.hint}>Unit belum diimpor di admin WAM.</p>)}
        <p className={styles.hint}>Terkirim sekarang ke menu Notifikasi penerima.</p>
        {formError && <Notice tone="error">{formError}</Notice>}
        <div className={styles.composeActions}>
          <ConsoleButton disabled={busy} onClick={() => setWriting(false)}>Batal</ConsoleButton>
          <ConsoleButton type="submit" variant="primary" disabled={busy || !ready} icon={<Send size={18} aria-hidden />}>{busy ? "Mengirim…" : "Kirim sekarang"}</ConsoleButton>
        </div>
      </form>}
    </dialog>
  </>;
}

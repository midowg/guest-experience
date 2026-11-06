"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Info, Send, X } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { clockLabel, wibDate, wibTime, type Room } from "@/lib/pra-wam/appraisal";
import { requestStatusLabels, spanLabel, type ScheduleRequest } from "@/lib/pra-wam/requests";
import { sessionTimes } from "@/lib/pra-wam/sessions";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest, PraWamApiError } from "./api";
import { useConfirm } from "./ConfirmDialog";
import { useSessionIntent } from "./SessionActions";
import panel from "./panitia.module.css";
import rows from "./peserta.module.css";
import styles from "./pra-wam.module.css";
import { withoutHonorific } from "@/lib/pra-wam/call-name";

type Props = { sessionId: string; startsAt: string; endsAt: string; rooms: Room[]; requests: ScheduleRequest[]; canAsk: boolean };

const shortDay = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)).replace(",", "");
/** "Sen 7 Des, 09.00" */
const moment = (date: string, time: string) => (date ? `${shortDay(date)}, ${clockLabel(time)}` : "Pilih tanggal");

/**
 * A participant's requests to move a session, and the sheet to ask (Penpot P9 "Ajukan ganti
 * jadwal"): what it was, what is proposed, the new time and room, and why. Asking changes nothing
 * yet; panitia decides. The sheet opens from "Ganti jadwal" in the page's action bar.
 */
export function RequestChange({ sessionId, startsAt, endsAt, rooms, requests, canAsk }: Props) {
  const router = useRouter();
  const open = requests.find(request => request.status === "diajukan");
  const sheet = useRef<HTMLDialogElement>(null);
  const [show, setShow] = useState(false);
  const blank = { date: wibDate(startsAt), start: wibTime(startsAt), end: wibTime(endsAt), roomId: "", reason: "" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));
  const [confirm, confirmDialog] = useConfirm();
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  useSessionIntent("ganti-jadwal", () => { setNotice(null); setSheetError(null); setShow(true); }, canAsk && !open);
  useEffect(() => {
    const dialog = sheet.current;
    if (!dialog) return;
    if (show && !dialog.open) dialog.showModal();
    if (!show && dialog.open) dialog.close();
  }, [show]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors({}); setSheetError(null); setNotice(null);
    try {
      const result = await praWamRequest(praWamApi.requestChange(sessionId), { method: "POST", json: form });
      setShow(false); setForm(blank); setNotice({ tone: "success", text: result.message }); router.refresh();
    } catch (problem) {
      if (problem instanceof PraWamApiError && problem.fieldErrors) {
        const found = Object.fromEntries(Object.entries(problem.fieldErrors).map(([key, list]) => [key, list[0]]));
        setErrors(found);
        // The first field with a problem gets the focus.
        const first = ["date", "start", "end", "reason"].find(key => found[key]);
        if (first) requestAnimationFrame(() => document.getElementById(`req-${first}`)?.focus());
      }
      setSheetError(errorText(problem));
    } finally { setBusy(false); }
  }
  async function withdraw(id: string) {
    if (!(await confirm({
      title: "Tarik permintaan?",
      body: "Panitia tidak lagi meninjau usulan ini. Kamu bisa mengajukan lagi nanti.",
      confirmLabel: "Tarik permintaan",
    }))) return;
    setBusy(true); setWithdrawing(id); setNotice(null);
    try { await praWamRequest(praWamApi.request(id), { method: "DELETE" }); setNotice({ tone: "success", text: "Permintaan ditarik." }); router.refresh(); }
    catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(false); setWithdrawing(null); }
  }

  return <div className={styles.section}>
    {confirmDialog}
    {notice && <div role="status"><Notice tone={notice.tone}>{notice.text}</Notice></div>}
    {requests.length > 0 && <p className={rows.groupLabel}>Permintaan ganti jadwal</p>}
    {requests.map(request => <article key={request.id} className={styles.mineItem}>
      <span className={styles.kicker}>{requestStatusLabels[request.status]}</span>
      <span>Usul: {spanLabel(request.toStartsAt, request.toEndsAt)}{request.toRoomName ? ` · ${request.toRoomName}` : ""}</span>
      <span className={styles.meta}>Alasan: {request.reason}</span>
      {request.reviewNote && <span className={styles.meta}>Catatan panitia: {request.reviewNote}</span>}
      {request.status === "diajukan" && <div className={styles.actions}><button type="button" className="button button--quiet" disabled={busy} onClick={() => withdraw(request.id)}>{withdrawing === request.id ? "Menarik…" : "Tarik permintaan"}</button></div>}
    </article>)}
    {canAsk && <dialog ref={sheet} className={rows.sheet} aria-labelledby="req-judul"
      onCancel={event => { event.preventDefault(); if (!busy) setShow(false); }}
      onClick={event => { if (event.target === sheet.current && !busy) setShow(false); }}>
      <form className={rows.sheetBody} onSubmit={submit} noValidate>
        <span className={rows.sheetHandle} aria-hidden />
        <div className={rows.sheetHead}>
          <h2 id="req-judul">Ajukan ganti jadwal</h2>
          <button type="button" className={rows.sheetClose} aria-label="Tutup" disabled={busy} onClick={() => setShow(false)}><X aria-hidden /></button>
        </div>
        <div className={rows.compare}>
          <span><small>Semula</small><strong>{moment(wibDate(startsAt), wibTime(startsAt))}</strong></span>
          <ArrowRight aria-hidden />
          <span><small>Usulan</small><strong>{moment(form.date, form.start)}</strong></span>
        </div>
        <fieldset className={rows.sheetFields}>
          <legend className={styles.label}>Pilih jadwal baru</legend>
          <div className={styles.times}>
            <div><label className={styles.label} htmlFor="req-date">Tanggal</label>
              <input id="req-date" className="input" type="date" value={form.date} aria-invalid={!!errors.date} onChange={event => set({ date: event.target.value })} />{errors.date && <p className={styles.error}>{errors.date}</p>}</div>
            <div><label className={styles.label} htmlFor="req-room">Ruang <span className={styles.meta}>(opsional)</span></label>
              <select id="req-room" className="select" value={form.roomId} onChange={event => set({ roomId: event.target.value })}>
                <option value="">Sama seperti sekarang</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
              </select></div>
            <div><label className={styles.label} htmlFor="req-start">Mulai</label>
              <select id="req-start" className="select" value={form.start} aria-invalid={!!errors.start} onChange={event => set({ start: event.target.value, end: event.target.value < form.end ? form.end : "" })}>
                {sessionTimes().map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
              </select>{errors.start && <p className={styles.error}>{errors.start}</p>}</div>
            <div><label className={styles.label} htmlFor="req-end">Selesai</label>
              <select id="req-end" className="select" value={form.end} aria-invalid={!!errors.end} onChange={event => set({ end: event.target.value })}>
                {!form.end && <option value="">Pilih</option>}
                {sessionTimes().filter(time => time > form.start).map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
              </select>{errors.end && <p className={styles.error}>{errors.end}</p>}</div>
          </div>
        </fieldset>
        <div><label className={styles.label} htmlFor="req-reason">Alasan</label>
          <textarea id="req-reason" className="textarea" rows={3} maxLength={1000} placeholder="Contoh: ada kunjungan klien sampai 11.00." value={form.reason} aria-invalid={!!errors.reason} onChange={event => set({ reason: event.target.value })} />
          {errors.reason ? <p className={styles.error}>{errors.reason}</p> : <p className={styles.hint}>Minimal 5 huruf.</p>}</div>
        {sheetError && <Notice tone="error">{sheetError}</Notice>}
        <Button type="submit" disabled={busy || form.reason.trim().length < 5 || !form.end}><Send size={18} aria-hidden /> {busy ? "Mengirim…" : "Kirim permintaan"}</Button>
        <p className={rows.sheetNote}><Info aria-hidden />Jadwal hanya berubah kalau disetujui panitia. Statusnya tampil di Beranda.</p>
      </form>
    </dialog>}
  </div>;
}

/** Panitia answers a request: approve (moves the session) or decline, with a note. */
export function RequestReview({ requests }: { requests: ScheduleRequest[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  // Approving asks once more in place (Penpot "K2"): the session moves and everyone is told.
  const [confirming, setConfirming] = useState<string | null>(null);
  async function answer(request: ScheduleRequest, approve: boolean) {
    setBusy(request.id); setNotice(null);
    try {
      const result = await praWamRequest(praWamApi.request(request.id), { method: "POST", json: { approve, note: notes[request.id] ?? "" } });
      setNotice({ tone: "success", text: result.message }); setConfirming(null); router.refresh();
    } catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(null); }
  }
  const initials = (name: string) => withoutHonorific(name).split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  const short = (startsAt: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(startsAt));
  return <div className={styles.section}>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {requests.length === 0 ? <p className={styles.meta}>Tidak ada permintaan yang menunggu.</p> : requests.map(request => <article key={request.id} className={panel.request}>
      <div className={panel.who}>
        <span className={panel.avatar} aria-hidden>{initials(request.requester)}</span>
        <span><strong>{request.requester}</strong><small>{request.sessionTitle}</small></span>
        <span className={`${panel.statusPill} ${panel.live}`}><Clock aria-hidden />Diajukan</span>
      </div>
      <div className={panel.compare}>
        <span><small>Semula</small><strong>{short(request.fromStartsAt)}</strong></span>
        <ArrowRight size={20} aria-hidden />
        <span><small>Usulan</small><strong>{short(request.toStartsAt)}</strong>{request.toRoomName && <small>{request.toRoomName}</small>}</span>
      </div>
      <p className={panel.quote}>&ldquo;{request.reason}&rdquo;</p>
      {request.stillCurrent
        ? <ul className={panel.checks}><li className={panel.ok}><CheckCircle2 aria-hidden /><span>Jadwal sesi belum berubah sejak diajukan</span></li><li className={panel.wait}><Info aria-hidden /><span>Ruang dicek saat disetujui; bila terpakai, persetujuan ditolak</span></li></ul>
        : <ul className={panel.checks}><li className={panel.no}><AlertTriangle aria-hidden /><span>Jadwal sesi sudah berubah sejak diajukan. Tolak dengan catatan.</span></li></ul>}
      <input className="input" aria-label={`Catatan untuk ${request.requester}`} placeholder="Catatan untuk pengaju (opsional)" maxLength={1000} value={notes[request.id] ?? ""} onChange={event => setNotes({ ...notes, [request.id]: event.target.value })} />
      {confirming === request.id ? <div className={panel.confirm}>
        <span>Jadwal sesi berubah ke {spanLabel(request.toStartsAt, request.toEndsAt)} dan semua peserta sesi menerima notifikasi. Lanjutkan?</span>
        <div className={panel.actionsCell}>
          <Button type="button" variant="secondary" disabled={!!busy} onClick={() => setConfirming(null)}>Batal</Button>
          <Button type="button" disabled={!!busy} onClick={() => answer(request, true)}>{busy === request.id ? "Menyimpan…" : "Ya, setujui"}</Button>
        </div>
      </div> : <div className={styles.actions}>
        <Button type="button" disabled={!!busy || !request.stillCurrent} onClick={() => setConfirming(request.id)}>Setujui</Button>
        <Button type="button" variant="secondary" disabled={!!busy} onClick={() => answer(request, false)}>Tolak</Button>
      </div>}
    </article>)}
  </div>;
}

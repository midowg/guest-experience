"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { clockLabel, wibDate, wibTime, type Room } from "@/lib/pra-wam/appraisal";
import { requestStatusLabels, spanLabel, type ScheduleRequest } from "@/lib/pra-wam/requests";
import { sessionTimes } from "@/lib/pra-wam/sessions";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest, PraWamApiError } from "./api";
import styles from "./pra-wam.module.css";

type Props = { sessionId: string; startsAt: string; endsAt: string; rooms: Room[]; requests: ScheduleRequest[]; canAsk: boolean };

/** A participant's requests to move a session, and the form to ask. Asking changes nothing yet. */
export function RequestChange({ sessionId, startsAt, endsAt, rooms, requests, canAsk }: Props) {
  const router = useRouter();
  const open = requests.find(request => request.status === "diajukan");
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ date: wibDate(startsAt), start: wibTime(startsAt), end: wibTime(endsAt), roomId: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const set = (patch: Partial<typeof form>) => setForm(current => ({ ...current, ...patch }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setErrors({}); setNotice(null);
    try {
      const result = await praWamRequest(praWamApi.requestChange(sessionId), { method: "POST", json: form });
      setShow(false); setNotice({ tone: "success", text: result.message }); router.refresh();
    } catch (problem) {
      if (problem instanceof PraWamApiError && problem.fieldErrors) setErrors(Object.fromEntries(Object.entries(problem.fieldErrors).map(([key, list]) => [key, list[0]])));
      setNotice({ tone: "error", text: errorText(problem) });
    } finally { setBusy(false); }
  }
  async function withdraw(id: string) {
    if (!window.confirm("Tarik permintaan ini?")) return;
    setBusy(true);
    try { await praWamRequest(praWamApi.request(id), { method: "DELETE" }); router.refresh(); }
    catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(false); }
  }

  return <div className={styles.section}>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {requests.map(request => <article key={request.id} className={styles.mineItem}>
      <span className={styles.kicker}>{requestStatusLabels[request.status]}</span>
      <span>Usul: {spanLabel(request.toStartsAt, request.toEndsAt)}{request.toRoomName ? ` · ${request.toRoomName}` : ""}</span>
      <span className={styles.meta}>Alasan: {request.reason}</span>
      {request.reviewNote && <span className={styles.meta}>Catatan panitia: {request.reviewNote}</span>}
      {request.status === "diajukan" && <div className={styles.actions}><button type="button" className="button button--quiet" disabled={busy} onClick={() => withdraw(request.id)}>Tarik permintaan</button></div>}
    </article>)}
    {canAsk && !open && !show && <div><Button type="button" variant="secondary" onClick={() => setShow(true)}>Ajukan ganti jadwal</Button>
      <p className={styles.hint}>Panitia meninjau dulu. Jadwal baru berlaku setelah disetujui, dan semua peserta diberi tahu.</p></div>}
    {show && <form className={`${styles.section} ${styles.detail}`} onSubmit={submit} noValidate>
      <h3>Usulan jadwal</h3>
      <div className={styles.times}>
        <div><label className={styles.label} htmlFor="req-date">Tanggal</label>
          <input id="req-date" className="input" type="date" value={form.date} onChange={event => set({ date: event.target.value })} />{errors.date && <p className={styles.error}>{errors.date}</p>}</div>
        <div><label className={styles.label} htmlFor="req-room">Ruang <span className={styles.meta}>(opsional)</span></label>
          <select id="req-room" className="select" value={form.roomId} onChange={event => set({ roomId: event.target.value })}>
            <option value="">Sama seperti sekarang</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select></div>
        <div><label className={styles.label} htmlFor="req-start">Mulai</label>
          <select id="req-start" className="select" value={form.start} onChange={event => set({ start: event.target.value })}>
            {sessionTimes().map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
          </select>{errors.start && <p className={styles.error}>{errors.start}</p>}</div>
        <div><label className={styles.label} htmlFor="req-end">Selesai</label>
          <select id="req-end" className="select" value={form.end} onChange={event => set({ end: event.target.value })}>
            {sessionTimes().filter(time => time > form.start).map(time => <option key={time} value={time}>{clockLabel(time)}</option>)}
          </select>{errors.end && <p className={styles.error}>{errors.end}</p>}</div>
      </div>
      <div><label className={styles.label} htmlFor="req-reason">Alasan</label>
        <textarea id="req-reason" className="textarea" rows={3} maxLength={1000} value={form.reason} onChange={event => set({ reason: event.target.value })} />
        {errors.reason && <p className={styles.error}>{errors.reason}</p>}</div>
      <div className={styles.actions}>
        <Button type="submit" disabled={busy || form.reason.trim().length < 5}>{busy ? "Mengirim…" : "Kirim ke panitia"}</Button>
        <button type="button" className="button button--quiet" onClick={() => setShow(false)}>Batal</button>
      </div>
    </form>}
  </div>;
}

/** Panitia answers a request: approve (moves the session) or decline, with a note. */
export function RequestReview({ requests }: { requests: ScheduleRequest[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  async function answer(request: ScheduleRequest, approve: boolean) {
    if (approve && !window.confirm(`Pindahkan "${request.sessionTitle}" ke ${spanLabel(request.toStartsAt, request.toEndsAt)}? Semua peserta diberi tahu.`)) return;
    setBusy(request.id); setNotice(null);
    try {
      const result = await praWamRequest(praWamApi.request(request.id), { method: "POST", json: { approve, note: notes[request.id] ?? "" } });
      setNotice({ tone: "success", text: result.message }); router.refresh();
    } catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(null); }
  }
  return <div className={styles.section}>
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
    {requests.length === 0 ? <p className={styles.meta}>Tidak ada permintaan yang menunggu.</p> : <div className={styles.mine}>
      {requests.map(request => <article key={request.id} className={styles.mineItem}>
        <h3>{request.sessionTitle}</h3>
        <span className={styles.meta}>Diajukan {request.requester}</span>
        <span>Sekarang: {spanLabel(request.fromStartsAt, request.fromEndsAt)}</span>
        <span><strong>Usul: {spanLabel(request.toStartsAt, request.toEndsAt)}{request.toRoomName ? ` · ${request.toRoomName}` : ""}</strong></span>
        <span className={styles.meta}>Alasan: {request.reason}</span>
        {!request.stillCurrent && <Notice tone="warning">Jadwal sesi sudah berubah sejak diajukan. Menyetujui tidak bisa; tolak dengan catatan.</Notice>}
        <input className="input" aria-label={`Catatan untuk ${request.requester}`} placeholder="Catatan untuk pengaju (opsional)" maxLength={1000} value={notes[request.id] ?? ""} onChange={event => setNotes({ ...notes, [request.id]: event.target.value })} />
        <div className={styles.actions}>
          <Button type="button" disabled={!!busy || !request.stillCurrent} onClick={() => answer(request, true)}>{busy === request.id ? "Menyimpan…" : "Setujui dan pindahkan"}</Button>
          <Button type="button" variant="secondary" disabled={!!busy} onClick={() => answer(request, false)}>Tolak</Button>
        </div>
      </article>)}
    </div>}
  </div>;
}

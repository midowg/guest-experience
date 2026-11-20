"use client";

import { useState } from "react";
import { FilePen, X } from "lucide-react";
import {
  kindLabels, REASON_KINDS, reasonLabels, requestStatusLabels, requestSummary, requestTypeLabels,
  type AttendanceRequest, type DailyKind, type DailyRecord, type ReasonKind, type RequestType,
} from "@/lib/hr/attendance";
import { instantLabel, type ViewerZone } from "@/lib/pra-wam/zone";
import { errorText } from "@/components/pra-wam/api";
import { cancelRequest, submitRequest } from "./clockInApi";
import styles from "./absen.module.css";

const dateOf = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const shortDate = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/**
 * Ajukan revisi (21 Nov 2026): for one day, pick masuk or pulang, then what is wrong: forgotten
 * (a time), a wrong time (the right one), a wrong reason or place, or cancel it; always why. Admin HR
 * decides; approving applies it. Only the choices that fit the slot are offered.
 */
export function RevisionForm({ date, records, zone, waiting, onDone, onCancel }: {
  date: string; records: Record<DailyKind, DailyRecord | null>; zone: ViewerZone;
  /** Slots that already have a request waiting. */
  waiting: DailyKind[];
  onDone(message: string): void; onCancel(): void;
}) {
  const firstKind: DailyKind = !records.masuk ? "masuk" : !records.pulang ? "pulang" : "masuk";
  const [kind, setKind] = useState<DailyKind>(firstKind);
  const record = records[kind];
  const types: RequestType[] = record ? ["ubah_jam", "ubah_alasan", "batal"] : ["tambah"];
  const [type, setType] = useState<RequestType>(types[0]);
  const [time, setTime] = useState(record ? instantLabel(record.at, zone).replace(".", ":") : kind === "masuk" ? "08:00" : "17:00");
  const [reasonKind, setReasonKind] = useState<ReasonKind>(record?.reasonKind ?? "dinas");
  const [reasonText, setReasonText] = useState(record?.reasonText ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const blocked = waiting.includes(kind);

  const pickKind = (next: DailyKind) => {
    const nextRecord = records[next];
    setKind(next); setProblem(null);
    setType(nextRecord ? "ubah_jam" : "tambah");
    setTime(nextRecord ? instantLabel(nextRecord.at, zone).replace(".", ":") : next === "masuk" ? "08:00" : "17:00");
    setReasonKind(nextRecord?.reasonKind ?? "dinas"); setReasonText(nextRecord?.reasonText ?? "");
  };

  async function send() {
    setBusy(true); setProblem(null);
    try {
      const message = await submitRequest({
        type, workDate: date, kind, recordId: record?.id ?? null,
        time: type === "tambah" || type === "ubah_jam" ? time : null, zone,
        reasonKind: type === "ubah_alasan" ? reasonKind : null, reasonText: type === "ubah_alasan" ? reasonText : "", note,
      });
      onDone(message);
    } catch (error) { setProblem(errorText(error)); setBusy(false); }
  }

  const ready = !blocked && note.trim().length >= 3 && (type !== "ubah_alasan" || reasonKind !== "lainnya" || reasonText.trim().length >= 3);
  return <section className={styles.panel} aria-labelledby="revisi-judul">
    <span className={styles.iconTile}><FilePen aria-hidden /></span>
    <h1 id="revisi-judul" className={styles.title}>Ajukan revisi <span className={styles.titleDate}>{dateOf(date)}</span></h1>
    <fieldset className={styles.reasons}>
      <legend>Absen yang mana?</legend>
      {(["masuk", "pulang"] as const).map(option => <label key={option} className={kind === option ? styles.reasonOn : styles.reason}>
        <input type="radio" name="revisi-absen" checked={kind === option} onChange={() => pickKind(option)} />
        {kindLabels[option]} · {records[option] ? instantLabel(records[option]!.at, zone) : "belum ada"}
      </label>)}
    </fieldset>
    {blocked
      ? <p className={styles.warn}>Sudah ada revisi yang menunggu untuk absen {kindLabels[kind].toLowerCase()} ini. Batalkan dulu di &quot;Revisi saya&quot; bila ingin mengubahnya.</p>
      : <>
        <fieldset className={styles.reasons}>
          <legend>Apa yang perlu diperbaiki?</legend>
          {types.map(option => <label key={option} className={type === option ? styles.reasonOn : styles.reason}>
            <input type="radio" name="revisi-jenis" checked={type === option} onChange={() => setType(option)} />
            {option === "tambah" ? `Lupa absen ${kindLabels[kind].toLowerCase()}` : requestTypeLabels[option]}
          </label>)}
        </fieldset>
        {(type === "tambah" || type === "ubah_jam") && <label className={styles.field}><span>Jam yang benar ({zone})</span><input type="time" value={time} onChange={event => setTime(event.target.value)} /></label>}
        {type === "ubah_alasan" && <>
          <fieldset className={styles.reasons}>
            <legend>Alasan yang benar</legend>
            {REASON_KINDS.map(option => <label key={option} className={reasonKind === option ? styles.reasonOn : styles.reason}>
              <input type="radio" name="revisi-alasan" checked={reasonKind === option} onChange={() => setReasonKind(option)} />
              {reasonLabels[option]}
            </label>)}
          </fieldset>
          <label className={styles.field}><span>Keterangan{reasonKind === "lainnya" ? "" : " (boleh kosong)"}</span><input type="text" maxLength={300} value={reasonText} onChange={event => setReasonText(event.target.value)} placeholder="Mis. nama venue atau klien" /></label>
        </>}
        {type === "batal" && <p className={styles.warn}>Absen ini akan dihapus bila Admin HR menyetujui.</p>}
        <label className={styles.field}><span>Kenapa perlu direvisi?</span><input type="text" maxLength={300} value={note} onChange={event => setNote(event.target.value)} placeholder="Mis. HP mati waktu datang" /></label>
      </>}
    {problem && <p className={styles.problem} role="alert">{problem}</p>}
    <div className={styles.buttons}>
      <button type="button" className={styles.main} disabled={busy || !ready} onClick={() => void send()}>{busy ? "Mengirim…" : "Kirim revisi"}</button>
      <button type="button" className={styles.second} disabled={busy} onClick={onCancel}>Batal</button>
    </div>
  </section>;
}

/** Revisi saya: the person's requests with where each stands; a waiting one can be withdrawn. */
export function MyRequests({ requests, onChanged }: { requests: AttendanceRequest[]; onChanged(message: string): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!requests.length) return null;
  async function withdraw(id: string) {
    setBusy(id);
    try { onChanged(await cancelRequest(id)); } catch (error) { onChanged(errorText(error)); } finally { setBusy(null); }
  }
  return <section className={styles.panel} aria-labelledby="revisi-saya">
    <h2 id="revisi-saya" className={styles.subtitle}><FilePen size={18} aria-hidden /> Revisi saya</h2>
    <ul className={styles.requests}>
      {requests.slice(0, 10).map(request => <li key={request.id}>
        <span className={styles.requestText}>
          <strong>{shortDate(request.workDate)} · {requestSummary(request)}</strong>
          <small>{request.note}{request.decisionNote ? ` · Admin HR: ${request.decisionNote}` : ""}</small>
        </span>
        <span className={`${styles.chip} ${styles[`req_${request.status}`]}`}>{requestStatusLabels[request.status]}</span>
        {request.status === "menunggu" && <button type="button" className={styles.iconOnly} disabled={busy === request.id} aria-label={`Batalkan revisi ${shortDate(request.workDate)}`} onClick={() => void withdraw(request.id)}><X size={16} aria-hidden /></button>}
      </li>)}
    </ul>
  </section>;
}

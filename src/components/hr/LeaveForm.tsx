"use client";

import { useId, useState } from "react";
import { LEAVE_BACK_DAYS, LEAVE_MAX_DAYS, LEAVE_TYPES, leaveDays, leaveHints, leaveLabels, overlaps, spanLabel, type LeaveRequest, type LeaveType } from "@/lib/hr/leave";
import { shiftDate } from "@/lib/hr/history";
import { errorText } from "@/components/pra-wam/api";
import { submitLeave } from "./clockInApi";
import { Segmented, Sheet } from "./ui";
import styles from "./absen.module.css";
import app from "./app.module.css";

const dayName = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

/**
 * Ajukan cuti, sakit, izin or dinas (21 Nov 2026), a sheet like Ajukan revisi: Batal on the left,
 * Kirim on the right once it can be sent. The kind (changeable here), the first and last day (31
 * days back to a year ahead; a single day is the same date twice), how many days that is, and a short
 * note that only the person and Admin HR read. A span that overlaps one of their own waiting or
 * approved requests says so before sending.
 */
export function LeaveSheet({ today, initialType, leaves, onDone, onCancel }: {
  today: string; initialType: LeaveType; leaves: LeaveRequest[]; onDone(message: string): void; onCancel(): void;
}) {
  const [type, setType] = useState<LeaveType>(initialType);
  const [startDate, setStart] = useState(today);
  const [endDate, setEnd] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const noteHint = useId();
  const earliest = shiftDate(today, -LEAVE_BACK_DAYS), latest = shiftDate(today, 366);
  const days = endDate >= startDate ? leaveDays(startDate, endDate) : 0;
  const clash = leaves.find(leave => (leave.status === "menunggu" || leave.status === "disetujui") && overlaps(leave, { startDate, endDate }));

  const pickStart = (value: string) => {
    if (!value) return;
    setStart(value); setProblem(null);
    if (endDate < value) setEnd(value);
  };
  async function send() {
    setBusy(true); setProblem(null);
    try { onDone(await submitLeave({ type, startDate, endDate, note: note.trim() })); }
    catch (error) { setProblem(errorText(error)); setBusy(false); }
  }

  const ready = !busy && !clash && days > 0 && days <= LEAVE_MAX_DAYS && note.trim().length >= 3;
  return <Sheet title={`Ajukan ${leaveLabels[type].toLowerCase()}`} lead={busy ? null : { kind: "cancel", onClick: onCancel }}
    action={<button type="button" className={`${app.barText} ${app.barStrong}`} disabled={!ready} onClick={() => void send()}>{busy ? "Mengirim…" : "Kirim"}</button>}>
    <Segmented<LeaveType> label="Jenis pengajuan" value={type} onChange={value => { setType(value); setProblem(null); }}
      options={LEAVE_TYPES.map(value => ({ value, label: leaveLabels[value] }))} />
    <p className={styles.small}>{leaveHints[type]}</p>
    <div className={styles.dates}>
      <label className={styles.field}>
        <span>Mulai</span>
        <input type="date" min={earliest} max={latest} value={startDate} onChange={event => pickStart(event.target.value)} />
      </label>
      <label className={styles.field}>
        <span>Sampai</span>
        <input type="date" min={startDate} max={latest} value={endDate} onChange={event => { if (event.target.value) { setEnd(event.target.value); setProblem(null); } }} />
      </label>
    </div>
    <p className={styles.daysLine} aria-live="polite">
      {days > 0 ? <><strong>{days} hari</strong> · {startDate === endDate ? dayName(startDate) : `${dayName(startDate)} – ${dayName(endDate)}`}</> : "Tanggal selesai tidak boleh sebelum tanggal mulai."}
      {days > LEAVE_MAX_DAYS && ` Paling lama ${LEAVE_MAX_DAYS} hari.`}
    </p>
    {clash && <p className={styles.warn}>Tanggal ini bertemu dengan pengajuanmu yang lain ({leaveLabels[clash.type].toLowerCase()} {spanLabel(clash.startDate, clash.endDate)}). {clash.status === "menunggu" ? "Batalkan yang lama dulu di Pengajuan bila ingin mengubahnya." : "Yang sudah disetujui hanya bisa dibatalkan Admin HR; hubungi HR bila rencanamu berubah."}</p>}
    <div className={styles.field}>
      <label className={styles.field}><span>Keterangan</span>
        <input type="text" maxLength={300} value={note} onChange={event => setNote(event.target.value)} aria-describedby={noteHint}
          placeholder={type === "dinas" ? "Mis. kunjungan klien di Surabaya" : type === "sakit" ? "Mis. demam, istirahat di rumah" : type === "izin" ? "Mis. urusan keluarga" : "Mis. pulang kampung"} />
      </label>
      <small id={noteHint} className={styles.fieldHint}>Minimal 3 huruf. Hanya kamu dan Admin HR yang membacanya; tim hanya melihat jenis dan tanggalnya.</small>
    </div>
    {problem && <p className={styles.problem} role="alert">{problem}</p>}
  </Sheet>;
}

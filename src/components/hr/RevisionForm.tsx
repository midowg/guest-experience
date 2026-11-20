"use client";

import { useId, useState } from "react";
import {
  kindLabels, REASON_KINDS, reasonLabels, REQUEST_DAYS, requestTypeLabels,
  type AttendanceRequest, type DailyKind, type DailyRecord, type ReasonKind, type RequestType,
} from "@/lib/hr/attendance";
import { shiftDate } from "@/lib/hr/history";
import { instantLabel, type ViewerZone } from "@/lib/pra-wam/zone";
import { errorText } from "@/components/pra-wam/api";
import { submitRequest } from "./clockInApi";
import { Choices, Segmented, Sheet } from "./ui";
import styles from "./absen.module.css";
import app from "./app.module.css";

const dateOf = (date: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

type Day = Record<DailyKind, DailyRecord | null>;
/** Which slot a day starts on: the first empty one, else masuk. */
const startKind = (records: Day): DailyKind => (!records.masuk ? "masuk" : !records.pulang ? "pulang" : "masuk");
/** The choices for a slot: its own time and reason, or a usual time. */
function fieldsFor(records: Day, kind: DailyKind, zone: ViewerZone) {
  const record = records[kind];
  return {
    kind, type: (record ? "ubah_jam" : "tambah") as RequestType,
    time: record ? instantLabel(record.at, zone).replace(".", ":") : kind === "masuk" ? "08:00" : "17:00",
    reasonKind: (record?.reasonKind ?? "dinas") as ReasonKind, reasonText: record?.reasonText ?? "",
  };
}

/**
 * Ajukan revisi (21 Nov 2026), a sheet in the Apple way: Batal on the left, Kirim on the right (only
 * when it can be sent). Pick the day (the last 31 days; opened from a day it starts there), masuk or
 * pulang, then what is wrong (rows with a check): forgotten (a time), a wrong time (the right one), a
 * wrong reason or place, or cancel it; always why. Admin HR decides; approving applies it. Only the
 * choices that fit the slot are offered; a new day starts the choices afresh.
 */
export function RevisionSheet({ today, initialDate, recent, requests, zone, onDone, onCancel }: {
  today: string; initialDate?: string; recent: DailyRecord[]; requests: AttendanceRequest[]; zone: ViewerZone;
  onDone(message: string): void; onCancel(): void;
}) {
  const earliest = shiftDate(today, -REQUEST_DAYS);
  const recordsOn = (date: string): Day => ({
    masuk: recent.find(record => record.workDate === date && record.kind === "masuk") ?? null,
    pulang: recent.find(record => record.workDate === date && record.kind === "pulang") ?? null,
  });
  const [date, setDate] = useState(initialDate && initialDate >= earliest && initialDate <= today ? initialDate : today);
  const records = recordsOn(date);
  const [fields, setFields] = useState(() => fieldsFor(records, startKind(records), zone));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const noteHint = useId();
  const { kind, type, time, reasonKind, reasonText } = fields;
  const record = records[kind];
  const types: RequestType[] = record ? ["ubah_jam", "ubah_alasan", "batal"] : ["tambah"];
  const blocked = requests.some(request => request.status === "menunggu" && request.workDate === date && request.kind === kind);
  const set = (patch: Partial<typeof fields>) => setFields(value => ({ ...value, ...patch }));

  const pickDate = (value: string) => {
    if (!value || value < earliest || value > today) return;
    const next = recordsOn(value);
    setDate(value); setProblem(null);
    setFields(fieldsFor(next, startKind(next), zone));
  };
  const pickKind = (next: DailyKind) => { setProblem(null); setFields(fieldsFor(records, next, zone)); };

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

  const ready = !busy && !blocked && note.trim().length >= 3 && (type !== "ubah_alasan" || reasonKind !== "lainnya" || reasonText.trim().length >= 3);
  return <Sheet title="Ajukan revisi" lead={busy ? null : { kind: "cancel", onClick: onCancel }}
    action={<button type="button" className={`${app.barText} ${app.barStrong}`} disabled={!ready} onClick={() => void send()}>{busy ? "Mengirim…" : "Kirim"}</button>}>
    <label className={styles.field}>
      <span>Tanggal</span>
      <input type="date" min={earliest} max={today} value={date} onChange={event => pickDate(event.target.value)} />
      <small className={styles.fieldHint}>{dateOf(date)}{date === today ? " · hari ini" : ""}</small>
    </label>
    <Segmented label="Absen yang mana" value={kind} onChange={pickKind} options={(["masuk", "pulang"] as const).map(option => ({
      value: option, label: `${kindLabels[option]} · ${records[option] ? instantLabel(records[option]!.at, zone) : "belum ada"}`,
    }))} />
    {blocked
      ? <p className={styles.warn}>Sudah ada revisi yang menunggu untuk absen {kindLabels[kind].toLowerCase()} ini. Batalkan dulu di Pengajuan bila ingin mengubahnya.</p>
      : <>
        <Choices label="Apa yang perlu diperbaiki?" name="revisi-jenis" value={type} onChange={option => set({ type: option })}
          options={types.map(option => ({ value: option, label: option === "tambah" ? `Lupa absen ${kindLabels[kind].toLowerCase()}` : requestTypeLabels[option] }))} />
        {(type === "tambah" || type === "ubah_jam") && <label className={styles.field}>
          <span>Jam yang benar ({zone})</span>
          <input type="time" value={time} onChange={event => set({ time: event.target.value })} />
          {type === "ubah_jam" && record && <small className={styles.fieldHint}>{instantLabel(record.at, zone)} → {time.replace(":", ".")}</small>}
        </label>}
        {type === "ubah_alasan" && <>
          <Choices label="Alasan yang benar" name="revisi-alasan" value={reasonKind} onChange={option => set({ reasonKind: option })}
            options={REASON_KINDS.map(option => ({ value: option, label: reasonLabels[option] }))} />
          <label className={styles.field}><span>Keterangan{reasonKind === "lainnya" ? "" : " (boleh kosong)"}</span><input type="text" maxLength={300} value={reasonText} onChange={event => set({ reasonText: event.target.value })} placeholder="Mis. nama venue atau klien" /></label>
        </>}
        {type === "batal" && <p className={styles.warn}>Absen ini akan dihapus bila Admin HR menyetujui.</p>}
        <div className={styles.field}>
          <label className={styles.field}><span>Kenapa perlu direvisi?</span><input type="text" maxLength={300} value={note} onChange={event => setNote(event.target.value)} placeholder="Mis. HP mati waktu datang" aria-describedby={noteHint} /></label>
          <small id={noteHint} className={styles.fieldHint}>Minimal 3 huruf. Admin HR memeriksa dan memutuskan; hasilnya muncul di Pengajuan.</small>
        </div>
      </>}
    {problem && <p className={styles.problem} role="alert">{problem}</p>}
  </Sheet>;
}

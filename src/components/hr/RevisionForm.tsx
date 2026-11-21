"use client";

import { useId, useState } from "react";
import {
  REASON_KINDS, REQUEST_DAYS,
  type AttendanceRequest, type DailyKind, type DailyRecord, type ReasonKind, type RequestType,
} from "@/lib/hr/attendance";
import { shiftDate } from "@/lib/hr/history";
import { zoneTime, type ViewerZone } from "@/lib/pra-wam/zone";
import { clockAt, hhmm, sayDate } from "@/lib/hr/lang";
import { problemText, useCopy } from "./lang";
import { submitRequest } from "./clockInApi";
import { Choices, Segmented, Sheet } from "./ui";
import styles from "./absen.module.css";
import app from "./app.module.css";

type Day = Record<DailyKind, DailyRecord | null>;
/** Which slot a day starts on: the first empty one, else masuk. */
const startKind = (records: Day): DailyKind => (!records.masuk ? "masuk" : !records.pulang ? "pulang" : "masuk");
/** The choices for a slot: its own time and reason, or a usual time. */
function fieldsFor(records: Day, kind: DailyKind, zone: ViewerZone) {
  const record = records[kind];
  return {
    kind, type: (record ? "ubah_jam" : "tambah") as RequestType,
    time: record ? zoneTime(record.at, zone) : kind === "masuk" ? "08:00" : "17:00",
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
  const { t, lang } = useCopy();
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
    } catch (error) { setProblem(problemText(t, error)); setBusy(false); }
  }

  const ready = !busy && !blocked && note.trim().length >= 3 && (type !== "ubah_alasan" || reasonKind !== "lainnya" || reasonText.trim().length >= 3);
  return <Sheet title={t.revision.title} lead={busy ? null : { kind: "cancel", onClick: onCancel }}
    action={<button type="button" className={`${app.barText} ${app.barStrong}`} disabled={!ready} onClick={() => void send()}>{busy ? t.common.sending : t.common.send}</button>}>
    <label className={styles.field}>
      <span>{t.revision.date}</span>
      <input type="date" min={earliest} max={today} value={date} onChange={event => pickDate(event.target.value)} />
      <small className={styles.fieldHint}>{sayDate(lang, date, t.dateLong)}{date === today ? t.revision.today : ""}</small>
    </label>
    <Segmented label={t.revision.which} value={kind} onChange={pickKind} options={(["masuk", "pulang"] as const).map(option => ({
      value: option, label: `${t.kind[option]} · ${records[option] ? clockAt(lang, records[option]!.at, zone) : t.revision.none}`,
    }))} />
    {blocked
      ? <p className={styles.warn}>{t.revision.blocked(t.clockNoun[kind])}</p>
      : <>
        <Choices label={t.revision.what} name="revisi-jenis" value={type} onChange={option => set({ type: option })}
          options={types.map(option => ({ value: option, label: option === "tambah" ? t.revision.forgot(t.clockIn[kind]) : t.requestType[option] }))} />
        {(type === "tambah" || type === "ubah_jam") && <label className={styles.field}>
          <span>{t.revision.rightTime(zone)}</span>
          <input type="time" value={time} onChange={event => set({ time: event.target.value })} />
          {type === "ubah_jam" && record && <small className={styles.fieldHint}>{clockAt(lang, record.at, zone)} → {hhmm(lang, time)}</small>}
        </label>}
        {type === "ubah_alasan" && <>
          <Choices label={t.revision.rightReason} name="revisi-alasan" value={reasonKind} onChange={option => set({ reasonKind: option })}
            options={REASON_KINDS.map(option => ({ value: option, label: t.reason[option] }))} />
          <label className={styles.field}><span>{t.revision.note(reasonKind === "lainnya")}</span><input type="text" maxLength={300} value={reasonText} onChange={event => set({ reasonText: event.target.value })} placeholder={t.revision.notePlaceholder} /></label>
        </>}
        {type === "batal" && <p className={styles.warn}>{t.revision.remove}</p>}
        <div className={styles.field}>
          <label className={styles.field}><span>{t.revision.why}</span><input type="text" maxLength={300} value={note} onChange={event => setNote(event.target.value)} placeholder={t.revision.whyPlaceholder} aria-describedby={noteHint} /></label>
          <small id={noteHint} className={styles.fieldHint}>{t.revision.whyHint}</small>
        </div>
      </>}
    {problem && <p className={styles.problem} role="alert">{problem}</p>}
  </Sheet>;
}

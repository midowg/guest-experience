"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { Notice } from "@/components/ui";
import { clockLabel, wibTime } from "@/lib/pra-wam/appraisal";
import type { AttendanceRow } from "@/lib/pra-wam/attendance";
import { praWamApi } from "@/lib/routes";
import { errorText, praWamRequest } from "./api";
import { useConfirm } from "./ConfirmDialog";
import panel from "./panitia.module.css";
import styles from "./pra-wam.module.css";

/** Who is present, with a hand correction for panitia; and replacing the QR when a sheet is lost. */
export function AttendancePanel({ sessionId, initial, canEdit }: { sessionId: string; initial: AttendanceRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [filter, setFilter] = useState<"semua" | "hadir" | "belum">("semua");
  const [confirm, confirmDialog] = useConfirm();
  const present = rows.filter(row => row.checkedInAt).length;
  const shown = rows.filter(row => filter === "semua" || (filter === "hadir") === !!row.checkedInAt);

  async function mark(row: AttendanceRow, value: boolean) {
    setBusy(row.employeeId); setNotice(null);
    try {
      const result = await praWamRequest<AttendanceRow[]>(praWamApi.sessionAttendance(sessionId), { method: "POST", json: { employeeId: row.employeeId, present: value } });
      setRows(result.data);
    } catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(null); }
  }
  async function renew() {
    if (!(await confirm({
      title: "Buat QR baru?",
      body: "Lembar QR yang sudah dicetak tidak bisa dipakai lagi dan harus diganti dengan cetakan baru.",
      confirmLabel: "Buat QR baru",
      danger: true,
    }))) return;
    setBusy("qr"); setNotice(null);
    try { setNotice({ tone: "success", text: (await praWamRequest(praWamApi.sessionQr(sessionId), { method: "POST" })).message }); router.refresh(); }
    catch (problem) { setNotice({ tone: "error", text: errorText(problem) }); }
    finally { setBusy(null); }
  }

  return <div className={styles.section}>
    {confirmDialog}
    {notice && <div role="status"><Notice tone={notice.tone}>{notice.text}</Notice></div>}
    <div className={styles.dates} role="group" aria-label="Saring">
      {(["semua", "hadir", "belum"] as const).map(value => <button key={value} type="button" className={`${styles.chip} ${styles.chipSmall}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>
        {value === "semua" ? `Semua (${rows.length})` : value === "hadir" ? `Hadir (${present})` : `Belum (${rows.length - present})`}
      </button>)}
    </div>
    {shown.length === 0 ? <p className={styles.meta}>Tidak ada nama di sini.</p> : <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>Nama</th><th>Status</th>{canEdit && <th>Tindakan</th>}</tr></thead>
        <tbody>{shown.map(row => <tr key={row.employeeId}>
          <td><strong>{row.name}</strong><small>{row.department}</small></td>
          <td>{row.checkedInAt
            ? <span className={`${panel.statusPill} ${panel.done}`}><CheckCircle2 aria-hidden />Hadir {clockLabel(wibTime(row.checkedInAt))}{row.method === "manual" ? " · manual" : ""}</span>
            : <span className={`${panel.statusPill} ${panel.soon}`}><Clock aria-hidden />Belum</span>}</td>
          {canEdit && <td><button type="button" className="button button--quiet" disabled={!!busy} onClick={() => mark(row, !row.checkedInAt)}>
            {busy === row.employeeId ? "Menyimpan…" : row.checkedInAt ? "Hapus tanda" : "Tandai hadir"}</button></td>}
        </tr>)}</tbody>
      </table>
    </div>}
    {canEdit && <div><button type="button" className="button button--quiet" disabled={!!busy} onClick={renew}>{busy === "qr" ? "Membuat…" : "Buat QR baru"}</button>
      <p className={styles.hint}>Hanya bila lembar QR hilang atau tersebar di luar ruangan.</p></div>}
  </div>;
}

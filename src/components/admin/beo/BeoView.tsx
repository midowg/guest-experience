"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Printer, Save } from "lucide-react";
import { Button, ButtonLink, Field, Notice } from "@/components/ui";
import { beoActions, beoStatuses, beoStatusLabels, type BeoAction, type BeoRevision, type BeoState, type BeoSummary } from "@/lib/beo";
import { beoVersionInfo, beoVersionParam, type BeoVersion } from "@/lib/beo-document";
import { formatDateTime, formatTime } from "@/lib/format";
import { tzLabel } from "@/lib/timezones";
import type { EventRecord } from "@/lib/types";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import styles from "@/components/admin/admin.module.css";
import { adminApi, adminEventPath } from "@/lib/routes";

const actionLabels: Record<BeoAction, string> = {
  save: "Simpan draf", set: "Tetapkan angka", revise: "Simpan revisi", final: "Tandai final", done: "Tandai selesai", reopen: "Buka lagi untuk revisi",
};
const actionHints: Partial<Record<BeoAction, string>> = {
  set: "Biasanya H-3. Setelah ditetapkan, angka hanya berubah lewat revisi beralasan.",
  final: "Biasanya H-1, angka terakhir untuk penyedia.",
};

type Props = { event: EventRecord; summary: BeoSummary; initial: BeoState; revisions: BeoRevision[]; migrated: boolean };

/**
 * The BEO for hospitality: three numbers, food and allergies, access needs, the service schedule,
 * and the Draf → Ditetapkan → Revisi → Final → Selesai flow. Printing and PDF export live on a
 * separate A4 page, in a supplier version (first names, no access list or history) or internal.
 */
export function BeoView({ event, summary, initial, revisions, migrated }: Props) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [prepared, setPrepared] = useState(initial.prepared_count === null ? "" : String(initial.prepared_count));
  const [notes, setNotes] = useState(initial.notes);
  const [reason, setReason] = useState("");
  const [revising, setRevising] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editable = state.status === "draft" || revising;
  const actions = beoActions(state.status);
  const count = prepared.trim() === "" ? null : Number(prepared);
  const stale = state.locked_at ? summary.changedSinceLock : 0;

  async function run(action: BeoAction) {
    if (action === "revise" && !revising) { setRevising(true); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest<BeoState>(adminApi(event.id, "beo"), {
        method: "PUT",
        body: JSON.stringify({ action, version: state.version, prepared_count: count, notes, ...(action === "revise" ? { reason } : {}) }),
      });
      if (result.data) setState(result.data);
      setRevising(false); setReason("");
      setMessage(result.message);
      // Revisions and the "needs review" count come from the server.
      if (action !== "save") router.refresh();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  const time = (value: string) => formatTime(value, event.timezone);
  return <div className={styles.beo}>
    {!migrated && <Notice tone="warning">Angka persiapan dan status BEO menunggu migrasi <code>202610210001_event_beo.sql</code>. Rekap di bawah sudah bisa dibaca dan dicetak.</Notice>}

    <ol className={styles.beoSteps} aria-label="Status BEO">
      {beoStatuses.map(status => <li key={status} aria-current={state.status === status ? "step" : undefined}>{beoStatusLabels[status]}</li>)}
    </ol>
    {stale > 0 && <Notice tone="warning" role="status"><AlertTriangle size={16} aria-hidden="true" /> Perlu ditinjau: {stale} jawaban RSVP masuk atau berubah setelah angka ditetapkan.</Notice>}

    <div className={styles.beoNumbers}>
      <div><span>Perkiraan dari survei</span><strong>{summary.estimate ?? "—"}</strong></div>
      <div><span>RSVP hadir</span><strong>{summary.attending}</strong><small>{summary.answeredYes} jawaban, termasuk pendamping</small></div>
      <div className={styles.beoPrepared}><span>Jumlah disiapkan</span><strong>{state.prepared_count ?? "—"}</strong></div>
    </div>

    {migrated && <section className={styles.guestCard} aria-labelledby="beo-form-title">
      <h2 id="beo-form-title" className={styles.guestCardTitle}>Angka untuk penyedia</h2>
      <Field label="Jumlah porsi/pax disiapkan" name="beo-prepared" hint={`RSVP hadir saat ini ${summary.attending}. Tambahkan cadangan bila perlu.`}>
        <input id="beo-prepared" inputMode="numeric" value={prepared} disabled={!editable || busy} onChange={e => setPrepared(e.target.value.replace(/\D/g, "").slice(0, 6))} />
      </Field>
      <Field label="Catatan untuk penyedia (opsional)" name="beo-notes" hint="Ikut tercetak di kedua versi. Jangan tulis nomor telepon tamu.">
        <textarea id="beo-notes" rows={3} maxLength={4000} value={notes} disabled={!editable || busy} onChange={e => setNotes(e.target.value)} />
      </Field>
      {revising && <Field label="Alasan revisi" name="beo-reason" hint="Contoh: klien menambah 5 tamu. Tercatat di riwayat.">
        <input id="beo-reason" maxLength={500} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} />
      </Field>}
      {error && <Notice tone="error" role="alert">{error}</Notice>}
      {message && <p role="status" className={styles.guestMessage}>{message}</p>}
      <div className={styles.qrActions}>
        {actions.map(action => <Button key={action} type="button" variant={action === "save" || (action === "revise" && !revising) || action === "reopen" ? "secondary" : "primary"} disabled={busy || (action === "revise" && revising && !reason.trim())} onClick={() => void run(action)}>
          {action === "save" && <Save size={16} aria-hidden="true" />} {action === "revise" && !revising ? "Revisi angka" : actionLabels[action]}
        </Button>)}
        {revising && <Button type="button" variant="secondary" disabled={busy} onClick={() => { setRevising(false); setPrepared(state.prepared_count === null ? "" : String(state.prepared_count)); setNotes(state.notes); }}>Batal</Button>}
      </div>
      {actions.map(action => actionHints[action] && <p key={action} className="field-hint">{actionLabels[action]}: {actionHints[action]}</p>)}
    </section>}
    <ExportCard eventId={event.id} />

    <section className={styles.beoSection} aria-labelledby="beo-food">
      <h2 id="beo-food">Makanan</h2>
      {summary.dietary.length === 0 ? <p>Belum ada kebutuhan makanan khusus dari tamu yang hadir.</p> : <ul className={styles.beoCounts}>
        {summary.dietary.map(item => <li key={item.key}><strong>{item.count}</strong> {item.label}</li>)}
      </ul>}
      <p className="field-hint">Dihitung per jawaban, bukan per orang: satu tamu bisa vegetarian sekaligus alergi.</p>
      {summary.allergies.length > 0 && <div className={styles.tableWrap}><table className={styles.table}>
        <caption>Alergi</caption>
        <thead><tr><th scope="col">Tamu</th><th scope="col">Alergen</th></tr></thead>
        <tbody>{summary.allergies.map((item, index) => <tr key={index}>
          <td>{item.name}</td><td>{item.details || "Belum dirinci, tanyakan ke tamu"}</td>
        </tr>)}</tbody>
      </table></div>}
      {summary.otherFood.length > 0 && <div className={styles.tableWrap}><table className={styles.table}>
        <caption>Makanan lainnya</caption>
        <thead><tr><th scope="col">Tamu</th><th scope="col">Keterangan</th></tr></thead>
        <tbody>{summary.otherFood.map((item, index) => <tr key={index}><td>{item.name.split(/\s+/)[0]}</td><td>{item.details || "—"}</td></tr>)}</tbody>
      </table></div>}
    </section>

    <section className={styles.beoSection} aria-labelledby="beo-access">
      <h2 id="beo-access">Akses khusus <small>(internal, tidak ikut versi penyedia)</small></h2>
      {summary.access.length === 0 ? <p>Tidak ada kebutuhan akses dari tamu yang hadir.</p> : <ul className={styles.beoList}>
        {summary.access.map((item, index) => <li key={index}><strong>{item.name}</strong>: {[...item.needs, item.other].filter(Boolean).join(", ")}</li>)}
      </ul>}
    </section>

    <section className={styles.beoSection} aria-labelledby="beo-schedule">
      <h2 id="beo-schedule">Jadwal layanan <small>({tzLabel(event.timezone)})</small></h2>
      {summary.schedule.length === 0 ? <p>Rundown belum diisi di editor acara.</p> : <ol className={styles.beoList}>
        {summary.schedule.map(item => <li key={item.id}><strong>{time(item.starts_at)}–{time(item.ends_at)}</strong> {item.title}</li>)}
      </ol>}
    </section>

    {revisions.length > 0 && <section className={styles.beoSection} aria-labelledby="beo-history">
      <h2 id="beo-history">Riwayat</h2>
      <ol className={styles.beoList}>{revisions.map(rev => <li key={rev.id}>
        <strong>Versi {rev.version} · {beoStatusLabels[rev.status]}</strong> · {formatDateTime(rev.at, event.timezone)} · disiapkan {rev.prepared_count ?? "—"}, RSVP hadir {rev.attending}
        {rev.reason && <> · “{rev.reason}”</>}{rev.device_id && <> · perangkat {rev.device_id.slice(0, 8)}</>}
      </li>)}</ol>
    </section>}

  </div>;
}

/** Two clearly different outputs: the supplier version and the internal one, each printable or as PDF. */
function ExportCard({ eventId }: { eventId: string }) {
  return <section className={styles.guestCard} aria-labelledby="beo-export-title">
    <h2 id="beo-export-title" className={styles.guestCardTitle}><Printer size={18} aria-hidden="true" /> Cetak &amp; ekspor</h2>
    <div className={styles.beoExports}>
      {(["vendor", "internal"] as BeoVersion[]).map(version => <div key={version} className={styles.beoExport} data-version={version}>
        <strong>{beoVersionInfo[version].label}</strong>
        <p>{beoVersionInfo[version].includes}</p>
        <div className={styles.qrActions}>
          <ButtonLink variant="secondary" href={adminEventPath(eventId, "beo-print", { versi: beoVersionParam[version] })} target="_blank" rel="noopener noreferrer"><Printer size={16} aria-hidden="true" /> Lihat &amp; cetak<span className="sr-only"> {beoVersionInfo[version].label.toLowerCase()} (tab baru)</span></ButtonLink>
          <ButtonLink href={adminApi(eventId, "beo/pdf", { versi: beoVersionParam[version] })} download><Download size={16} aria-hidden="true" /> Unduh PDF<span className="sr-only"> {beoVersionInfo[version].label.toLowerCase()}</span></ButtonLink>
        </div>
      </div>)}
    </div>
  </section>;
}

"use client";

import { useState } from "react";
import { Check, ImageOff, ScanFace, Trash2, X } from "lucide-react";
import { ConsoleButton } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { clockMethodLabels, flagLabels, kindLabels, reasonLabels, type DailyRecord } from "@/lib/hr/attendance";
import { matchPercent, scoreLabel } from "@/lib/hr/face-match";
import { distanceLabel } from "@/lib/hr/geo";
import { hrAdminApi } from "@/lib/routes";
import css from "./hr-admin.module.css";

/**
 * One clock-in to look at and decide (Admin HR, 20 Nov 2026): the selfie beside the reference photo,
 * the score, where it was and why it waits, then Setujui, Tolak (with a reason) or Jadikan foto acuan.
 * "Hapus absen" (21 Nov 2026, for test data and mistakes) sits last and apart, and asks once, in place,
 * naming whose clock-in it is and that the selfie goes too. Used by Perlu dicek and Absen harian alike.
 */
const when = (record: DailyRecord) => `${new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${record.workDate}T12:00:00Z`))} ${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(record.at))}`;

export function RecordReview({ record, employeeId, name, hasFace, onChanged, onDeleted, onMessage }: {
  record: DailyRecord; employeeId: string; name: string; hasFace: boolean;
  onChanged(record: DailyRecord): void;
  /** The clock-in is gone: the list drops it. */
  onDeleted(record: DailyRecord): void;
  onMessage(message: { tone: "success" | "error"; text: string }): void;
}) {
  const [note, setNote] = useState("");
  const [refusing, setRefusing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function decide(status: "sah" | "ditolak") {
    setBusy(true);
    try {
      const result = await adminRequest<DailyRecord>(hrAdminApi.record(record.id), { method: "PATCH", body: JSON.stringify({ status, note: status === "ditolak" ? note : "" }) });
      if (result.data) onChanged(result.data);
      onMessage({ tone: "success", text: `${result.message} (${name})` });
      setRefusing(false); setNote("");
    } catch (error) { onMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }
  async function asReference() {
    if (!window.confirm(`Jadikan selfie ini foto acuan ${name}? Wajah acuan lamanya diganti.`)) return;
    setBusy(true);
    try { const result = await adminRequest<null>(hrAdminApi.asReference(record.id), { method: "POST", body: "{}" }); onMessage({ tone: "success", text: result.message }); }
    catch (error) { onMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try {
      const result = await adminRequest<DailyRecord>(hrAdminApi.record(record.id), { method: "DELETE" });
      onMessage({ tone: "success", text: `${result.message} (${name})` });
      onDeleted(record);
    } catch (error) { onMessage({ tone: "error", text: errorMessage(error) }); setDeleting(false); }
    finally { setBusy(false); }
  }

  return <div className={css.review}>
    <div className={css.photos}>
      <figure>
        {record.hasSelfie
          // eslint-disable-next-line @next/next/no-img-element -- a five-minute storage address; next/image would cache it
          ? <img src={hrAdminApi.selfie(record.id)} alt={`Selfie absen ${name}`} loading="lazy" />
          : <span className={css.photoEmpty}><ImageOff size={18} aria-hidden /> {record.method === "manual" ? "Dicatat manual" : "Selfie sudah dihapus"}</span>}
        <figcaption>Selfie saat absen</figcaption>
      </figure>
      <figure>
        {hasFace
          // eslint-disable-next-line @next/next/no-img-element -- a five-minute storage address; next/image would cache it
          ? <img src={hrAdminApi.facePhoto(employeeId, true)} alt={`Foto acuan ${name}`} loading="lazy" />
          : <span className={css.photoEmpty}>Belum ada foto acuan</span>}
        <figcaption>Foto acuan</figcaption>
      </figure>
    </div>
    <dl className={css.facts}>
      {record.faceScore !== null && <><dt>Kecocokan wajah</dt><dd><strong>{matchPercent(record.faceScore)}%</strong> {record.faceScore >= 0.363 ? "(cocok)" : "(rendah)"} · skor {scoreLabel(record.faceScore)}</dd></>}
      {record.faceMethod && <><dt>Metode</dt><dd>{clockMethodLabels[record.faceMethod]}</dd></>}
      {record.reasonKind && <><dt>Alasan</dt><dd>{reasonLabels[record.reasonKind]}{record.reasonText ? ` · ${record.reasonText}` : ""}</dd></>}
      {record.distanceM !== null && <><dt>Jarak</dt><dd>{distanceLabel(record.distanceM)}{record.officeName ? ` dari ${record.officeName}` : ""}</dd></>}
      {record.accuracyM !== null && <><dt>Akurasi GPS</dt><dd>±{distanceLabel(record.accuracyM)}</dd></>}
      {record.flags.length > 0 && <><dt>Kenapa dicek</dt><dd>{record.flags.map(flag => flagLabels[flag]).join(", ")}</dd></>}
      {record.reviewNote && <><dt>Catatan</dt><dd>{record.reviewNote}</dd></>}
    </dl>
    {deleting
      ? <div className={css.confirm} role="alertdialog" aria-labelledby={`hapus-${record.id}`}>
        <p id={`hapus-${record.id}`}><strong>Hapus absen {kindLabels[record.kind].toLowerCase()} {name}, {when(record)}?</strong> {record.hasSelfie ? "Selfie-nya ikut terhapus. " : ""}Ini tidak bisa dibatalkan.</p>
        <div className={css.actions}>
          <ConsoleButton className={css.danger} icon={<Trash2 size={16} aria-hidden />} disabled={busy} onClick={() => void remove()}>Ya, hapus absen</ConsoleButton>
          <ConsoleButton disabled={busy} onClick={() => setDeleting(false)}>Batal</ConsoleButton>
        </div>
      </div>
      : refusing
      ? <div className={css.actions}>
        <label className={`${css.field} ${css.grow}`}>Alasan ditolak<input type="text" maxLength={300} value={note} autoFocus onChange={event => setNote(event.target.value)} placeholder="Mis. lokasi tidak sesuai jadwal" /></label>
        <ConsoleButton variant="primary" icon={<X size={16} aria-hidden />} disabled={busy || note.trim().length < 3} onClick={() => void decide("ditolak")}>Tolak absen</ConsoleButton>
        <ConsoleButton disabled={busy} onClick={() => { setRefusing(false); setNote(""); }}>Batal</ConsoleButton>
      </div>
      : <div className={css.actions}>
        {record.status !== "sah" && <ConsoleButton variant="primary" icon={<Check size={16} aria-hidden />} disabled={busy} onClick={() => void decide("sah")}>Setujui</ConsoleButton>}
        {record.status !== "ditolak" && record.method === "wajah" && <ConsoleButton icon={<X size={16} aria-hidden />} disabled={busy} onClick={() => setRefusing(true)}>Tolak</ConsoleButton>}
        {record.hasSelfie && record.method === "wajah" && <ConsoleButton icon={<ScanFace size={16} aria-hidden />} disabled={busy} onClick={() => void asReference()}>Jadikan foto acuan</ConsoleButton>}
        <span className={css.spacer} aria-hidden />
        <ConsoleButton className={css.danger} icon={<Trash2 size={16} aria-hidden />} disabled={busy} onClick={() => { setRefusing(false); setDeleting(true); }}>Hapus absen</ConsoleButton>
      </div>}
  </div>;
}

"use client";

import { useState } from "react";
import { Check, ImageOff, ScanFace, X } from "lucide-react";
import { ConsoleButton } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { flagLabels, reasonLabels, type DailyRecord } from "@/lib/hr/attendance";
import { scoreLabel } from "@/lib/hr/face-match";
import { distanceLabel } from "@/lib/hr/geo";
import { hrAdminApi } from "@/lib/routes";
import css from "./hr-admin.module.css";

/**
 * One clock-in to look at and decide (Admin HR, 20 Nov 2026): the selfie beside the reference photo,
 * the score, where it was and why it waits, then Setujui, Tolak (with a reason) or Jadikan foto acuan.
 * Used by Perlu dicek and Absen harian alike.
 */
export function RecordReview({ record, employeeId, name, hasFace, onChanged, onMessage }: {
  record: DailyRecord; employeeId: string; name: string; hasFace: boolean;
  onChanged(record: DailyRecord): void;
  onMessage(message: { tone: "success" | "error"; text: string }): void;
}) {
  const [note, setNote] = useState("");
  const [refusing, setRefusing] = useState(false);
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
      {record.faceScore !== null && <><dt>Kecocokan wajah</dt><dd>{scoreLabel(record.faceScore)} {record.faceScore >= 0.363 ? "(cocok)" : "(rendah)"}</dd></>}
      {record.reasonKind && <><dt>Alasan</dt><dd>{reasonLabels[record.reasonKind]}{record.reasonText ? ` · ${record.reasonText}` : ""}</dd></>}
      {record.distanceM !== null && <><dt>Jarak</dt><dd>{distanceLabel(record.distanceM)}{record.officeName ? ` dari ${record.officeName}` : ""}</dd></>}
      {record.accuracyM !== null && <><dt>Akurasi GPS</dt><dd>±{distanceLabel(record.accuracyM)}</dd></>}
      {record.flags.length > 0 && <><dt>Kenapa dicek</dt><dd>{record.flags.map(flag => flagLabels[flag]).join(", ")}</dd></>}
      {record.reviewNote && <><dt>Catatan</dt><dd>{record.reviewNote}</dd></>}
    </dl>
    {refusing
      ? <div className={css.actions}>
        <label className={`${css.field} ${css.grow}`}>Alasan ditolak<input type="text" maxLength={300} value={note} autoFocus onChange={event => setNote(event.target.value)} placeholder="Mis. lokasi tidak sesuai jadwal" /></label>
        <ConsoleButton variant="primary" icon={<X size={16} aria-hidden />} disabled={busy || note.trim().length < 3} onClick={() => void decide("ditolak")}>Tolak absen</ConsoleButton>
        <ConsoleButton disabled={busy} onClick={() => { setRefusing(false); setNote(""); }}>Batal</ConsoleButton>
      </div>
      : <div className={css.actions}>
        {record.status !== "sah" && <ConsoleButton variant="primary" icon={<Check size={16} aria-hidden />} disabled={busy} onClick={() => void decide("sah")}>Setujui</ConsoleButton>}
        {record.status !== "ditolak" && record.method === "wajah" && <ConsoleButton icon={<X size={16} aria-hidden />} disabled={busy} onClick={() => setRefusing(true)}>Tolak</ConsoleButton>}
        {record.hasSelfie && record.method === "wajah" && <ConsoleButton icon={<ScanFace size={16} aria-hidden />} disabled={busy} onClick={() => void asReference()}>Jadikan foto acuan</ConsoleButton>}
      </div>}
  </div>;
}

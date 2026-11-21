"use client";

import { useState } from "react";
import { Check, ImageOff, Pencil, ScanFace, Trash2, X } from "lucide-react";
import { ConsoleButton } from "@/components/console";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { clockMethodLabels, flagLabels, kindLabels, REASON_KINDS, reasonLabels, type DailyRecord, type ReasonKind } from "@/lib/hr/attendance";
import { VIEWER_ZONES, zoneTime, type ViewerZone } from "@/lib/pra-wam/zone";
import { matchPercent, scoreLabel } from "@/lib/hr/face-match";
import { distanceLabel } from "@/lib/hr/geo";
import { hrAdminApi } from "@/lib/routes";
import css from "./hr-admin.module.css";

/**
 * One clock-in to look at and decide (Admin HR, 20 Nov 2026): the selfie beside the reference photo,
 * the score, where it was and why it waits, then Setujui, Tolak (with a reason) or Jadikan foto acuan.
 * "Hapus absen" (21 Nov 2026, for test data and mistakes) sits last and apart, and asks once, in place,
 * naming whose clock-in it is and that the selfie goes too. Used by Perlu dicek and Absen harian alike.
 * "Ubah" (21 Nov 2026, the audit): the time (same work day, in a chosen zone) and where it was
 * (the office it was taken in, or a reason outside), always with why; the status stays.
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
  // Taken inside an office point (no reason was needed), or recorded by hand; the server checks it again.
  const inOffice = !record.reasonKind || record.method === "manual";
  const [change, setChange] = useState<{ time: string; zone: ViewerZone; place: "kantor" | ReasonKind; reasonText: string; note: string } | null>(null);
  const startChange = () => {
    setRefusing(false); setDeleting(false);
    setChange({ time: zoneTime(record.at, "WIB"), zone: "WIB", place: record.reasonKind ?? (inOffice ? "kantor" : "event"), reasonText: record.reasonText ?? "", note: "" });
  };

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
  async function saveChange() {
    if (!change) return;
    setBusy(true);
    try {
      const result = await adminRequest<DailyRecord>(hrAdminApi.record(record.id), { method: "PATCH", body: JSON.stringify({ action: "ubah", ...change }) });
      if (result.data) onChanged(result.data);
      onMessage({ tone: "success", text: `${result.message} (${name})` });
      setChange(null);
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
    {change
      ? <div className={css.editBox}>
        <div className={css.form}>
          <label className={css.field}>Jam {kindLabels[record.kind].toLowerCase()}<input type="time" value={change.time} autoFocus onChange={event => setChange({ ...change, time: event.target.value })} /></label>
          <label className={css.field}>Zona
            <select value={change.zone} onChange={event => { const zone = event.target.value as ViewerZone; setChange({ ...change, zone, time: change.zone === zone ? change.time : zoneTime(record.at, zone) }); }}>{VIEWER_ZONES.map(zone => <option key={zone} value={zone}>{zone}</option>)}</select>
          </label>
          <label className={css.field}>Tempat
            <select value={change.place} onChange={event => setChange({ ...change, place: event.target.value as "kantor" | ReasonKind })}>
              <option value="kantor">{record.officeName && inOffice ? `Di kantor (${record.officeName})` : "Di kantor"}</option>
              {REASON_KINDS.map(kind => <option key={kind} value={kind}>{reasonLabels[kind]}</option>)}
            </select>
          </label>
          {change.place !== "kantor" && <label className={`${css.field} ${css.grow}`}>Keterangan tempat{change.place === "lainnya" ? "" : " (boleh kosong)"}<input type="text" maxLength={300} value={change.reasonText} onChange={event => setChange({ ...change, reasonText: event.target.value })} placeholder="Mis. nama venue atau klien" /></label>}
          <label className={`${css.field} ${css.grow}`}>Alasan perubahan<input type="text" maxLength={300} value={change.note} onChange={event => setChange({ ...change, note: event.target.value })} placeholder="Mis. sesuai laporan atasan" /></label>
        </div>
        <div className={css.actions}>
          <ConsoleButton variant="primary" icon={<Check size={16} aria-hidden />} disabled={busy || !change.time || change.note.trim().length < 3 || (change.place === "lainnya" && change.reasonText.trim().length < 3)} onClick={() => void saveChange()}>Simpan perubahan</ConsoleButton>
          <ConsoleButton disabled={busy} onClick={() => setChange(null)}>Batal</ConsoleButton>
        </div>
      </div>
      : deleting
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
        <ConsoleButton icon={<Pencil size={16} aria-hidden />} disabled={busy} onClick={startChange}>Ubah</ConsoleButton>
        {record.hasSelfie && record.method === "wajah" && <ConsoleButton icon={<ScanFace size={16} aria-hidden />} disabled={busy} onClick={() => void asReference()}>Jadikan foto acuan</ConsoleButton>}
        <span className={css.spacer} aria-hidden />
        <ConsoleButton className={css.danger} icon={<Trash2 size={16} aria-hidden />} disabled={busy} onClick={() => { setRefusing(false); setDeleting(true); }}>Hapus absen</ConsoleButton>
      </div>}
  </div>;
}

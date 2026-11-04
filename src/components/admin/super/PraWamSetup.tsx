"use client";

import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { praWamEventsApi, praWamUnitsApi } from "@/lib/routes";
import type { PraWamEvent } from "@/lib/server/pra-wam/events";
import type { Membership, Unit } from "@/lib/server/pra-wam/units";
import styles from "@/components/admin/admin.module.css";

const statusLabels: Record<PraWamEvent["status"], string> = { aktif: "Aktif (tampil)", disiapkan: "Disiapkan (belum tampil)", selesai: "Selesai" };
const moduleLabels: Record<string, string> = { appraisal: "Book: booking ruang" };
type People = { id: string; name: string }[];
type Message = { tone: "success" | "error"; text: string; list?: string[] } | null;

function EventRow({ event, onSaved }: { event: PraWamEvent; onSaved: (events: PraWamEvent[], text: string) => void }) {
  const [status, setStatus] = useState(event.status);
  const [modules, setModules] = useState(event.modules);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = status !== event.status || JSON.stringify(modules) !== JSON.stringify(event.modules);
  async function save() {
    setBusy(true); setError(null);
    try {
      const result = await adminRequest<{ events: PraWamEvent[] }>(praWamEventsApi(event.id), { method: "PATCH", body: JSON.stringify({ status, modules }) });
      if (result.data) onSaved(result.data.events, `${event.name}: ${result.message}`);
    } catch (problem) { setError(errorMessage(problem)); }
    finally { setBusy(false); }
  }
  return <tr>
    <td>{event.name}<br /><small>{event.startDate} – {event.endDate}</small></td>
    <td><select className="select" aria-label={`Status ${event.name}`} value={status} onChange={change => setStatus(change.target.value as PraWamEvent["status"])}>
      {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></td>
    <td>{event.kind === "pra_wam" ? Object.entries(moduleLabels).map(([key, label]) => <label key={key}><input type="checkbox" checked={modules[key] === true} onChange={change => setModules({ ...modules, [key]: change.target.checked })} /> {label}</label>) : <small>Modul WAM disiapkan setelah Pra WAM.</small>}</td>
    <td><Button type="button" variant="secondary" disabled={busy || !changed} onClick={save}>{busy ? "Menyimpan…" : "Simpan"}</Button>{error && <div role="alert">{error}</div>}</td>
  </tr>;
}

/**
 * Pra WAM settings beside the accounts: the events (Pra WAM shown, WAM prepared) with their
 * modules, and the units with their people and leads, imported from the Data karyawan workbook.
 */
export function PraWamSetup({ initialEvents, eventsMigrated, initialUnits, initialMemberships, unitsMigrated, people }: {
  initialEvents: PraWamEvent[]; eventsMigrated: boolean; initialUnits: Unit[]; initialMemberships: Membership[]; unitsMigrated: boolean; people: People;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [units, setUnits] = useState(initialUnits);
  const [memberships, setMemberships] = useState(initialMemberships);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const name = (id: string) => people.find(person => person.id === id)?.name ?? "Tanpa nama";

  async function upload() {
    if (!file) return;
    setBusy(true); setMessage(null);
    const body = new FormData();
    body.set("file", file);
    try {
      const result = await adminRequest<{ units: Unit[]; memberships: Membership[]; unmatched: string[]; skipped: string[] }>(praWamUnitsApi, { method: "POST", body });
      if (result.data) { setUnits(result.data.units); setMemberships(result.data.memberships); }
      setMessage({ tone: "success", text: result.message, list: [...(result.data?.unmatched ?? []).map(item => `Tidak ditemukan di Data karyawan: ${item}`), ...(result.data?.skipped ?? [])] });
    } catch (error) { setMessage({ tone: "error", text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  return <div className="stack">
    <h2>Acara dan modul</h2>
    {!eventsMigrated ? <Notice tone="warning">Acara menunggu migrasi 202611040003_pra_wam_events_units.sql. Sampai saat itu Book tetap terbuka.</Notice> : <>
      <p>Satu aplikasi untuk Pra WAM dan WAM. Acara berstatus Disiapkan belum tampil untuk peserta. Mematikan modul Book menutup booking ruang.</p>
      <div style={{ overflowX: "auto" }}><table className={styles.table}>
        <thead><tr><th>Acara</th><th>Status</th><th>Modul</th><th /></tr></thead>
        <tbody>{events.map(event => <EventRow key={`${event.id}-${event.status}-${JSON.stringify(event.modules)}`} event={event} onSaved={(next, text) => { setEvents(next); setMessage({ tone: "success", text }); }} />)}</tbody>
      </table></div>
    </>}

    <h2>Unit dan jabatan</h2>
    {!unitsMigrated ? <Notice tone="warning">Unit menunggu migrasi 202611040003_pra_wam_events_units.sql.</Notice> : <>
      <p>Unggah berkas Data karyawan yang punya sheet <strong>Unit dan jabatan</strong> (kolom NIP, Nama panggilan, Jenis unit, Unit, Jabatan di unit, Utama). Satu orang boleh ada di beberapa unit; baris &ldquo;Lead departemen&rdquo; atau &ldquo;Lead BU&rdquo; menjadikannya lead. Impor mengganti semua keanggotaan dengan isi sheet.</p>
      <div className={styles.qrActions}>
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Berkas Excel unit dan jabatan" onChange={change => setFile(change.target.files?.[0] ?? null)} />
        <Button type="button" disabled={busy || !file} onClick={upload}>{busy ? "Mengimpor…" : "Impor unit dan jabatan"}</Button>
      </div>
      {units.length > 0 && <div style={{ overflowX: "auto" }}><table className={styles.table}>
        <thead><tr><th>Unit</th><th>Lead</th><th>Anggota</th></tr></thead>
        <tbody>{units.map(unit => {
          const members = memberships.filter(member => member.unitId === unit.id);
          const leads = members.filter(member => member.isLead).map(member => name(member.employeeId));
          return <tr key={unit.id}>
            <td>{unit.name}{unit.code && unit.code !== unit.name ? ` (${unit.code})` : ""}<br /><small>{unit.kind === "bu" ? "BU" : "Departemen"}</small></td>
            <td>{leads.length ? leads.join(", ") : "Belum ditentukan"}</td>
            <td>{members.length}</td>
          </tr>;
        })}</tbody>
      </table></div>}
    </>}
    {message && <Notice tone={message.tone}>{message.text}{message.list?.length ? <ul>{message.list.map(item => <li key={item}>{item}</li>)}</ul> : null}</Notice>}
  </div>;
}

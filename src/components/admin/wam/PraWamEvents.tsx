"use client";

import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { praWamEventsApi } from "@/lib/routes";
import type { PraWamEvent } from "@/lib/server/pra-wam/events";
import styles from "@/components/admin/admin.module.css";

const eventStatusLabels: Record<PraWamEvent["status"], string> = { aktif: "Aktif (tampil)", disiapkan: "Disiapkan (belum tampil)", selesai: "Selesai" };
const moduleLabels: Record<string, string> = { appraisal: "Book: booking ruang" };

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
      {Object.entries(eventStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></td>
    <td>{event.kind === "pra_wam" ? Object.entries(moduleLabels).map(([key, label]) => <label key={key}><input type="checkbox" checked={modules[key] === true} onChange={change => setModules({ ...modules, [key]: change.target.checked })} /> {label}</label>) : <small>Modul WAM disiapkan setelah Pra WAM.</small>}</td>
    <td><Button type="button" variant="secondary" disabled={busy || !changed} onClick={save}>{busy ? "Menyimpan…" : "Simpan"}</Button>{error && <div role="alert">{error}</div>}</td>
  </tr>;
}

/** Admin WAM → Acara dan modul: the events (Pra WAM shown, WAM prepared) with their status and modules. */
export function PraWamEvents({ initial, migrated }: { initial: PraWamEvent[]; migrated: boolean }) {
  const [events, setEvents] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  return <div className="stack">
    <h2>Acara dan modul</h2>
    {!migrated ? <Notice tone="warning">Acara menunggu migrasi 202611040003_pra_wam_events_units.sql. Sampai saat itu Book tetap terbuka.</Notice> : <>
      <p>Satu aplikasi untuk Pra WAM dan WAM. Acara berstatus Disiapkan belum tampil untuk peserta. Mematikan modul Book menutup booking ruang.</p>
      <div style={{ overflowX: "auto" }}><table className={styles.table}>
        <thead><tr><th>Acara</th><th>Status</th><th>Modul</th><th /></tr></thead>
        <tbody>{events.map(event => <EventRow key={`${event.id}-${event.status}-${JSON.stringify(event.modules)}`} event={event} onSaved={(next, text) => { setEvents(next); setMessage(text); }} />)}</tbody>
      </table></div>
    </>}
    {message && <Notice tone="success">{message}</Notice>}
  </div>;
}

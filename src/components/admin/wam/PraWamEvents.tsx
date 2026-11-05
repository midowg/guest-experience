"use client";

import { useId, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { Card, ConsoleButton, Pill, type ConsoleTone } from "@/components/console";
import { praWamEventsApi } from "@/lib/routes";
import type { PraWamEvent } from "@/lib/server/pra-wam/events";
import css from "./pra-wam-rooms.module.css";

const eventStatusLabels: Record<PraWamEvent["status"], string> = { aktif: "Aktif (tampil)", disiapkan: "Disiapkan (belum tampil)", selesai: "Selesai" };
const statusPill: Record<PraWamEvent["status"], { tone: ConsoleTone; label: string }> = {
  aktif: { tone: "ok", label: "Aktif" }, disiapkan: { tone: "warn", label: "Disiapkan" }, selesai: { tone: "neutral", label: "Selesai" },
};
const moduleLabels: Record<string, string> = { appraisal: "Book: booking ruang" };

const day = (iso: string, year: boolean) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
/** "4 – 7 Jan 2027" style range, from the two dates (YYYY-MM-DD). */
export function eventDates(start: string, end: string): string {
  if (!start || !end) return start || end || "Tanggal belum diisi";
  if (start === end) return day(start, true);
  return `${day(start, start.slice(0, 4) !== end.slice(0, 4))} – ${day(end, true)}`;
}

/** One event as a card: its dates and status, the status picker, its modules with a switch each, and Simpan. */
function EventCard({ event, onSaved }: { event: PraWamEvent; onSaved: (events: PraWamEvent[], text: string) => void }) {
  const id = useId();
  const [status, setStatus] = useState(event.status);
  const [modules, setModules] = useState(event.modules);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = status !== event.status || JSON.stringify(modules) !== JSON.stringify(event.modules);
  const pill = statusPill[event.status];
  async function save() {
    setBusy(true); setError(null);
    try {
      const result = await adminRequest<{ events: PraWamEvent[] }>(praWamEventsApi(event.id), { method: "PATCH", body: JSON.stringify({ status, modules }) });
      if (result.data) onSaved(result.data.events, `${event.name}: ${result.message}`);
    } catch (problem) { setError(errorMessage(problem)); }
    finally { setBusy(false); }
  }
  return <Card title={event.name} id={`${id}-judul`}>
    <div className={css.eventMeta}>
      <span className={css.eventDates}><CalendarDays size={18} aria-hidden="true" />{eventDates(event.startDate, event.endDate)}</span>
      <Pill tone={pill.tone}>{pill.label}</Pill>
    </div>
    <div className="field">
      <label htmlFor={`${id}-status`}>Status</label>
      <select id={`${id}-status`} className="select" value={status} disabled={busy} onChange={change => setStatus(change.target.value as PraWamEvent["status"])}>
        {Object.entries(eventStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <div className={css.moduleBlock}>
      <h3 className={css.moduleTitle}>Modul</h3>
      {event.kind === "pra_wam"
        ? <ul className={css.moduleList}>{Object.entries(moduleLabels).map(([key, label]) => {
          const on = modules[key] === true;
          return <li key={key} className={css.moduleRow}>
            <span className={css.moduleText}><span>{label}</span><span>{on ? "Dibuka" : "Ditutup"}</span></span>
            <label className={css.switch}>
              <input type="checkbox" role="switch" checked={on} disabled={busy} aria-label={label} onChange={change => setModules({ ...modules, [key]: change.target.checked })} />
              <span className={css.switchTrack} aria-hidden="true" />
            </label>
          </li>;
        })}</ul>
        : <p className={css.note}>Modul WAM disiapkan setelah Pra WAM.</p>}
    </div>
    <div className={css.actions}>
      <ConsoleButton variant={changed ? "primary" : "secondary"} disabled={busy || !changed} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan"}</ConsoleButton>
      {!changed && !busy && <span className={css.note}>Belum ada perubahan.</span>}
    </div>
    {error && <div role="alert" className="field-error">{error}</div>}
  </Card>;
}

/** Admin WAM → Acara dan modul: Pra WAM and WAM side by side, each with its status and modules. */
export function PraWamEvents({ initial, migrated }: { initial: PraWamEvent[]; migrated: boolean }) {
  const [events, setEvents] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  if (!migrated) return <Notice tone="warning">Acara menunggu migrasi 202611040003_pra_wam_events_units.sql. Sampai saat itu Book tetap terbuka.</Notice>;
  return <div className="stack">
    <div aria-live="polite">{message && <Notice tone="success" role="status">{message}</Notice>}</div>
    {events.length
      ? <div className={css.eventGrid}>
        {events.map(event => <EventCard key={`${event.id}-${event.status}-${JSON.stringify(event.modules)}`} event={event} onSaved={(next, text) => { setEvents(next); setMessage(text); }} />)}
      </div>
      : <p className={css.note}>Belum ada acara.</p>}
  </div>;
}

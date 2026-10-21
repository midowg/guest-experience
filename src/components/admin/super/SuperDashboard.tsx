"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, Eye, EyeOff, LayoutGrid, Search, X } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import type { EventRecord } from "@/lib/types";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import styles from "@/components/admin/admin.module.css";
import { adminEventPath } from "@/lib/routes";

export type SuperEventRow = Pick<EventRecord, "id" | "title" | "slug" | "status" | "starts_at" | "timezone" | "event_kind" | "audience" | "updated_at">;
type Filter = "all" | "visible" | "hidden";
const statusLabels = { draft: "Draf", published: "Dipublikasikan", archived: "Diarsipkan" } as const;
const kindLabels = { kunjungan: "Kunjungan", acara: "Acara", program: "Program" } as const;

/** Which events regular admins can see: one switch per event, plus bulk hide/show. */
export function SuperDashboard({ events, initialHidden, migrated }: { events: SuperEventRow[]; initialHidden: string[]; migrated: boolean }) {
  const [hidden, setHidden] = useState(() => new Set(initialHidden));
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const counts = { all: events.length, hidden: events.filter(event => hidden.has(event.id)).length, visible: events.filter(event => !hidden.has(event.id)).length };
  const shown = useMemo(() => {
    const term = query.trim().toLowerCase();
    return events.filter(event => (filter === "all" || (filter === "hidden") === hidden.has(event.id)) && (!term || event.title.toLowerCase().includes(term) || event.slug.includes(term)));
  }, [events, filter, query, hidden]);
  const allShownSelected = shown.length > 0 && shown.every(event => selected.has(event.id));

  async function apply(ids: string[], hide: boolean) {
    if (busy || !ids.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest<{ ids: string[]; hidden: boolean }>("/api/admin/visibility", { method: "PUT", body: JSON.stringify({ ids, hidden: hide }) });
      setHidden(current => { const next = new Set(current); for (const id of ids) { if (hide) next.add(id); else next.delete(id); } return next; });
      setSelected(new Set());
      setMessage(result.message);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  function toggleSelect(id: string) {
    setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  return <div className="stack">
    {!migrated && <Notice tone="warning">Menyembunyikan acara menunggu migrasi <code>202610200005_admin_roles.sql</code>. Terapkan migrasi itu di Supabase, lalu muat ulang halaman ini.</Notice>}
    <div className={styles.superStats} role="list" aria-label="Ringkasan">
      <div role="listitem"><strong>{counts.all}</strong><span>Total acara</span></div>
      <div role="listitem"><strong>{counts.visible}</strong><span>Terlihat oleh admin</span></div>
      <div role="listitem"><strong>{counts.hidden}</strong><span>Disembunyikan</span></div>
    </div>

    <div className={styles.superToolbar}>
      <label className={styles.superSearch}><Search size={16} aria-hidden="true" /><span className="sr-only">Cari acara</span>
        <input className="input" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari judul atau slug acara" />
      </label>
      <nav className={styles.filterChips} aria-label="Saring acara">
        {([["all", "Semua"], ["visible", "Terlihat"], ["hidden", "Disembunyikan"]] as const).map(([key, label]) =>
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} <span>{counts[key]}</span></button>)}
      </nav>
    </div>

    {error && <Notice tone="error">{error}</Notice>}
    {message && <p role="status" className={styles.guestMessage}>{message}</p>}

    {selected.size > 0 && migrated && <div className={styles.superBulk} role="region" aria-label="Aksi untuk acara terpilih">
      <strong>{selected.size} acara dipilih</strong>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => apply([...selected], true)}><EyeOff size={16} aria-hidden="true" /> Sembunyikan</Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={() => apply([...selected], false)}><Eye size={16} aria-hidden="true" /> Tampilkan</Button>
      <Button type="button" variant="quiet" onClick={() => setSelected(new Set())}><X size={16} aria-hidden="true" /> Batal pilih</Button>
    </div>}

    {shown.length === 0 ? <p className="muted">{events.length ? "Tidak ada acara untuk saringan ini." : "Belum ada acara."}</p> : <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="sr-only">Daftar acara dan visibilitasnya untuk admin biasa</caption>
        <thead><tr>
          {migrated && <th scope="col"><input type="checkbox" aria-label="Pilih semua yang tampil" checked={allShownSelected} onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map(event => event.id)))} /></th>}
          <th scope="col">Acara</th><th scope="col">Tanggal</th><th scope="col">Status</th><th scope="col">Terlihat oleh admin</th>
        </tr></thead>
        <tbody>{shown.map(event => {
          const isHidden = hidden.has(event.id);
          return <tr key={event.id} className={isHidden ? styles.superRowHidden : undefined}>
            {migrated && <td><input type="checkbox" aria-label={`Pilih ${event.title}`} checked={selected.has(event.id)} onChange={() => toggleSelect(event.id)} /></td>}
            <td>
              <a href={adminEventPath(event)} className={styles.superTitle}>{event.title}</a>
              <p className={styles.superMeta}>{kindLabels[event.event_kind] ?? "Acara"} · {event.audience === "internal" ? "Internal" : "Eksternal"} · /e/{event.slug} · disimpan {formatDateTime(event.updated_at)}</p>
            </td>
            <td><span className={styles.superDate}><CalendarDays size={14} aria-hidden="true" /> {event.starts_at ? formatDate(event.starts_at, event.timezone) : "—"}</span></td>
            <td>{statusLabels[event.status]}</td>
            <td>
              <label className={styles.superSwitch}>
                <input type="checkbox" role="switch" checked={!isHidden} disabled={busy || !migrated} onChange={() => apply([event.id], !isHidden)} aria-label={`Terlihat oleh admin: ${event.title}`} />
                <span>{isHidden ? <><EyeOff size={14} aria-hidden="true" /> Disembunyikan</> : <><Eye size={14} aria-hidden="true" /> Terlihat</>}</span>
              </label>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>}

    <p><Link href="/admin" className={styles.headerLink}><LayoutGrid size={16} aria-hidden="true" /> Buka panel acara</Link></p>
  </div>;
}

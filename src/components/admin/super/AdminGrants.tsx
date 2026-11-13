"use client";

import { useMemo, useState } from "react";
import { ConsoleButton, Pill } from "@/components/console";
import { Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { ADMIN_APPS, ADMIN_GRANTS_MIGRATION, adminAppHints, adminAppLabels, grantEventsLabel, type AdminApp, type AdminGrant } from "@/lib/admin-access";
import { adminGrantsApi } from "@/lib/routes";
import css from "./admin-table.module.css";

export type GrantPersonView = { id: string; name: string; department: string; category: string; hasAccount: boolean; picOf: number };
export type GrantEventView = { id: string; title: string; kind: string };
type Draft = { employeeId: string; apps: AdminApp[]; allEvents: boolean; eventIds: string[] };

const categoryLabel = (category: string) => category === "intern" ? "Intern" : category === "dw" ? "DW" : "";

/**
 * Super admin → Akses admin (13 Nov 2026): who may sign in to the admin with their own WAM account,
 * and what each opens. One table of admins; "Tambah admin" or "Ubah" opens the editor above it.
 */
export function AdminGrants({ initial, people, events, migrated }: { initial: AdminGrant[]; people: GrantPersonView[]; events: GrantEventView[]; migrated: boolean }) {
  const [grants, setGrants] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [adding, setAdding] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const byId = useMemo(() => new Map(people.map(person => [person.id, person])), [people]);
  const eventTitle = useMemo(() => new Map(events.map(event => [event.id, event.title])), [events]);
  const granted = new Set(grants.map(grant => grant.employeeId));
  const candidates = people.filter(person => !granted.has(person.id));
  // Only Acara's events are picked here; Friday Sharing and Your Visit open by their app.
  const pickable = events.filter(event => event.kind !== "csr" && event.kind !== "panduan" && event.title.toLowerCase().includes(search.trim().toLowerCase()));

  const open = (grant: AdminGrant | null, employeeId: string) => {
    setError(""); setMessage(""); setSearch("");
    setDraft(grant ? { ...grant } : { employeeId, apps: [], allEvents: false, eventIds: [] });
  };
  const toggleApp = (app: AdminApp) => setDraft(current => current && ({ ...current, apps: current.apps.includes(app) ? current.apps.filter(item => item !== app) : [...current.apps, app] }));
  const toggleEvent = (id: string) => setDraft(current => current && ({ ...current, eventIds: current.eventIds.includes(id) ? current.eventIds.filter(item => item !== id) : [...current.eventIds, id] }));

  async function save() {
    if (!draft) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest<AdminGrant>(adminGrantsApi(draft.employeeId), { method: "PUT", body: JSON.stringify({ apps: draft.apps, allEvents: draft.allEvents, eventIds: draft.eventIds }) });
      const saved = result.data!;
      setGrants(list => list.some(item => item.employeeId === saved.employeeId) ? list.map(item => item.employeeId === saved.employeeId ? saved : item) : [...list, saved]);
      setDraft(null); setAdding(""); setMessage(result.message);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function revoke(employeeId: string) {
    const name = byId.get(employeeId)?.name ?? "orang ini";
    if (!window.confirm(`Cabut akses admin ${name}? Ia langsung keluar dari admin; akun WAM-nya tetap.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await adminRequest(adminGrantsApi(employeeId), { method: "DELETE" });
      setGrants(list => list.filter(item => item.employeeId !== employeeId));
      if (draft?.employeeId === employeeId) setDraft(null);
      setMessage(result.message);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  if (!migrated) return <Notice tone="warning">Akses admin per orang menunggu migrasi <code>{ADMIN_GRANTS_MIGRATION}</code>. Sampai migrasi dijalankan, admin masih masuk dengan password admin bersama.</Notice>;
  const editing = draft ? byId.get(draft.employeeId) : null;

  return <div>
    {error && <Notice tone="error" role="alert">{error}</Notice>}
    {message && <p role="status" className={css.muted}>{message}</p>}

    {!draft && <div className={css.toolbar}>
      <label>Tambah admin
        <select className={css.select} value={adding} onChange={event => setAdding(event.target.value)} aria-label="Pilih orang">
          <option value="">Pilih orang dari Data karyawan…</option>
          {candidates.map(person => <option key={person.id} value={person.id} disabled={!person.hasAccount}>
            {person.name}{categoryLabel(person.category) ? ` (${categoryLabel(person.category)})` : ""}{person.department ? ` · ${person.department}` : ""}{person.hasAccount ? "" : " · belum punya akun WAM"}
          </option>)}
        </select>
      </label>
      <ConsoleButton variant="primary" disabled={!adding || busy} onClick={() => open(null, adding)}>Atur akses</ConsoleButton>
    </div>}

    {draft && editing && <section className={css.editor} aria-labelledby="grant-editor">
      <h3 id="grant-editor">Akses admin: {editing.name}</h3>
      <fieldset>
        <legend>Aplikasi yang bisa dibuka</legend>
        {ADMIN_APPS.map(app => <label key={app} className={css.check}>
          <input type="checkbox" checked={draft.apps.includes(app)} onChange={() => toggleApp(app)} />
          <span>{adminAppLabels[app]}</span>
          <small>{adminAppHints[app]}</small>
        </label>)}
      </fieldset>
      {draft.apps.includes("acara") && <fieldset>
        <legend>Acara yang bisa dibuka</legend>
        <label className={css.check}><input type="radio" name="events" checked={draft.allEvents} onChange={() => setDraft({ ...draft, allEvents: true })} /><span>Semua acara</span><small>Termasuk mengatur acara di halaman utama.</small></label>
        <label className={css.check}><input type="radio" name="events" checked={!draft.allEvents} onChange={() => setDraft({ ...draft, allEvents: false })} /><span>Acara tertentu</span><small>Hanya yang dicentang di bawah, acara yang ia buat sendiri, dan acara yang PIC-nya dia.</small></label>
        {!draft.allEvents && <>
          <input className={css.search} type="search" placeholder="Cari acara" value={search} onChange={event => setSearch(event.target.value)} aria-label="Cari acara" />
          <div className={css.eventPick}>
            {pickable.length === 0 ? <span className={css.muted}>Tidak ada acara.</span> : pickable.map(event => <label key={event.id} className={css.check}>
              <input type="checkbox" checked={draft.eventIds.includes(event.id)} onChange={() => toggleEvent(event.id)} />
              <span>{event.title}</span>
            </label>)}
          </div>
        </>}
      </fieldset>}
      <p className={css.muted}>Acara yang PIC-nya {editing.name} selalu bisa ia buka{editing.picOf ? "" : ". Hubungkan namanya di Tim Werkudara supaya ini berlaku"}.</p>
      <div className={css.buttons}>
        <ConsoleButton variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan akses"}</ConsoleButton>
        <ConsoleButton disabled={busy} onClick={() => setDraft(null)}>Batal</ConsoleButton>
      </div>
    </section>}

    {grants.length === 0 ? <p className={css.muted}>Belum ada admin. Tambahkan orang yang mengelola acara atau WAM.</p> : <div className={css.wrap}>
      <table className={css.table}>
        <thead><tr><th>Nama</th><th>Aplikasi</th><th>Acara</th><th><span className="sr-only">Aksi</span></th></tr></thead>
        <tbody>{grants.map(grant => {
          const person = byId.get(grant.employeeId);
          const picked = grant.eventIds.map(id => eventTitle.get(id)).filter(Boolean).join(", ");
          return <tr key={grant.employeeId}>
            <td data-label="Nama"><div><span className={css.strong}>{person?.name ?? "(tidak di Data karyawan)"}</span>{person?.department && <div className={css.muted}>{person.department}</div>}</div></td>
            <td data-label="Aplikasi">{grant.apps.length ? <span className={css.chips}>{grant.apps.map(app => <Pill key={app} tone="blue">{adminAppLabels[app]}</Pill>)}</span> : <span className={css.muted}>Hanya acara PIC-nya</span>}</td>
            <td data-label="Acara" title={picked || undefined}><div>{grantEventsLabel(grant)}{person?.picOf ? <div className={css.muted}>PIC di Tim Werkudara</div> : null}</div></td>
            <td className={css.actions}>
              <ConsoleButton disabled={busy} onClick={() => open(grant, grant.employeeId)} aria-label={`Ubah akses ${person?.name ?? ""}`}>Ubah</ConsoleButton>
              <ConsoleButton disabled={busy} onClick={() => void revoke(grant.employeeId)} aria-label={`Cabut akses ${person?.name ?? ""}`}>Cabut</ConsoleButton>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </div>;
}

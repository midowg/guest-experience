"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { PhotoField } from "@/components/admin/shared/PhotoField";
import { StaffAvatar } from "@/components/admin/shared/StaffAvatar";
import { staffApi } from "@/lib/routes";
import type { StaffMember } from "@/lib/types";
import styles from "@/components/admin/admin.module.css";

type Draft = { name: string; role: string; phone: string; photo: StaffMember["photo"]; active: boolean };
const blank: Draft = { name: "", role: "", phone: "", photo: { url: "", alt: "", srcset: [] }, active: true };

function StaffForm({ initial, busy, onSave, onCancel }: { initial: Draft; busy: boolean; onSave: (draft: Draft) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<Draft>) => setDraft(current => ({ ...current, ...patch }));
  return <form className={styles.staffForm} onSubmit={e => { e.preventDefault(); onSave(draft); }}>
    <div className={styles.grid}>
      <Field name="staff-name" label="Nama"><input id="staff-name" className="input" value={draft.name} maxLength={150} required onChange={e => set({ name: e.target.value })} placeholder="Contoh: Raka Pratama" /></Field>
      <Field name="staff-role" label="Jabatan"><input id="staff-role" className="input" value={draft.role} maxLength={150} onChange={e => set({ role: e.target.value })} placeholder="Contoh: Hospitality" /></Field>
    </div>
    <Field name="staff-phone" label="Nomor WhatsApp" hint="Nomor HP 08…, misalnya 0812 3456 7890. Dipakai tombol hubungi PIC di undangan.">
      <input id="staff-phone" className="input" inputMode="tel" value={draft.phone} maxLength={30} required onChange={e => set({ phone: e.target.value })} aria-describedby="staff-phone-hint" />
    </Field>
    <PhotoField name="staff-photo" label="Foto (opsional)" value={draft.photo.url} srcset={draft.photo.srcset} hint="Foto wajah yang boleh tampil untuk tamu. Tanpa foto, kartu PIC memakai inisial." onChange={value => set({ photo: { ...draft.photo, ...value, alt: draft.name } })} />
    <label className={styles.superSwitch}>
      <input type="checkbox" role="switch" checked={draft.active} onChange={e => set({ active: e.target.checked })} />
      <span>{draft.active ? "Aktif, bisa dipilih sebagai PIC" : "Nonaktif, tidak muncul di pilihan PIC"}</span>
    </label>
    <div className={styles.qrActions}>
      <Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Batal</Button>
    </div>
  </form>;
}

/**
 * Tim Werkudara: the people an event's PIC can be picked from. Picking copies their details into
 * the event, so changing someone here does not alter events already set up.
 */
export function StaffSettings({ initial, migrated }: { initial: StaffMember[]; migrated: boolean }) {
  const [staff, setStaff] = useState(initial);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function save(id: string | "new", draft: Draft) {
    setBusy(true); setError(""); setMessage("");
    try {
      const body = JSON.stringify({ ...draft, photo: { ...draft.photo, alt: draft.photo.url ? draft.name : "" } });
      const result = id === "new"
        ? await adminRequest<StaffMember>(staffApi(), { method: "POST", body })
        : await adminRequest<StaffMember>(staffApi(id), { method: "PUT", body });
      const saved = result.data!;
      setStaff(list => id === "new" ? [...list, saved] : list.map(item => item.id === id ? saved : item));
      setEditing(null); setMessage(result.message);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }
  async function remove(person: StaffMember) {
    if (!window.confirm(`Hapus ${person.name} dari daftar tim? Acara yang sudah memakai ${person.name} sebagai PIC tidak berubah.`)) return;
    setBusy(true); setError("");
    try { await adminRequest(staffApi(person.id), { method: "DELETE" }); setStaff(list => list.filter(item => item.id !== person.id)); setMessage(`${person.name} dihapus.`); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <section className={styles.moduleSettings} aria-labelledby="staff-title">
    <h2 id="staff-title" className={styles.superSectionTitle}><Users size={20} aria-hidden="true" /> Tim Werkudara</h2>
    <p className={styles.lead}>Orang-orang yang bisa dipilih sebagai PIC acara. Di editor, admin cukup mengetuk satu nama: nama, jabatan, nomor WhatsApp, dan foto langsung terisi.</p>
    {!migrated && <Notice tone="warning">Daftar tim menunggu migrasi <code>202610210005_staff_members.sql</code>.</Notice>}
    {error && <Notice tone="error" role="alert">{error}</Notice>}
    {message && <p role="status" className={styles.guestMessage}>{message}</p>}
    {migrated && editing === "new" && <StaffForm initial={blank} busy={busy} onSave={draft => void save("new", draft)} onCancel={() => setEditing(null)} />}
    {migrated && editing !== "new" && <Button type="button" style={{ justifySelf: "start" }} onClick={() => { setEditing("new"); setMessage(""); }}><Plus size={16} aria-hidden="true" /> Tambah orang</Button>}
    {staff.length === 0 ? migrated && <p className="muted">Belum ada anggota tim. Tambahkan orang yang biasa menjadi PIC acara.</p> : <ul className={styles.staffList}>
      {staff.map(person => <li key={person.id} data-inactive={person.active ? undefined : ""}>
        {editing === person.id ? <StaffForm initial={person} busy={busy} onSave={draft => void save(person.id, draft)} onCancel={() => setEditing(null)} /> : <>
          <StaffAvatar person={person} size={52} />
          <div className={styles.staffText}>
            <strong>{person.name}</strong>
            <span>{[person.role, person.phone].filter(Boolean).join(" · ")}</span>
            {!person.active && <span className={styles.staffInactive}>Nonaktif</span>}
          </div>
          <div className={styles.staffActions}>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => { setEditing(person.id); setMessage(""); }} aria-label={`Ubah ${person.name}`}><Pencil size={16} aria-hidden="true" /> Ubah</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void remove(person)} aria-label={`Hapus ${person.name}`}><Trash2 size={16} aria-hidden="true" /></Button>
          </div>
        </>}
      </li>)}
    </ul>}
  </section>;
}

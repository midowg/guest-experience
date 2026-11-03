"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, Pencil, Upload } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { categoryLabels, employeeCategories, type Employee, type EmployeeCategory, type EmployeeRow, type ImportChange } from "@/lib/employees";
import { employeesApi } from "@/lib/routes";
import styles from "@/components/admin/admin.module.css";

type Plan = { sheet: string; skipped: string[]; migrated: boolean; plan: { row: EmployeeRow; change: ImportChange; changed: string[] }[] };
const changeLabels: Record<ImportChange, string> = { baru: "Baru", berubah: "Diperbarui", sama: "Tetap" };
const fieldLabels: Record<string, string> = { full_name: "nama", nickname: "panggilan", department: "departemen", position: "jabatan", office: "office" };

/** Phone and email, the details an app may need that HR's sheet does not have. */
function ContactForm({ person, busy, onSave, onCancel }: { person: Employee; busy: boolean; onSave: (patch: Pick<Employee, "nickname" | "phone" | "email">) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState({ nickname: person.nickname, phone: person.phone, email: person.email });
  return <form className="stack" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
    <div className={styles.grid}>
      <Field name={`nick-${person.id}`} label="Nama panggilan"><input id={`nick-${person.id}`} className="input" value={draft.nickname} maxLength={60} onChange={e => setDraft({ ...draft, nickname: e.target.value })} /></Field>
      <Field name={`phone-${person.id}`} label="Nomor WhatsApp"><input id={`phone-${person.id}`} className="input" inputMode="tel" value={draft.phone} maxLength={30} placeholder="0812 3456 7890" onChange={e => setDraft({ ...draft, phone: e.target.value })} /></Field>
      <Field name={`email-${person.id}`} label="Email kantor"><input id={`email-${person.id}`} className="input" type="email" value={draft.email} maxLength={200} onChange={e => setDraft({ ...draft, email: e.target.value })} /></Field>
    </div>
    <div className={styles.qrActions}>
      <Button type="submit" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</Button>
      <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>Batal</Button>
    </div>
  </form>;
}

/**
 * Data karyawan: one list of Werkudara's people for every Journey app. An import from HR's Excel
 * is checked first (who is new, who changed) and saved only on request; category, phone, email
 * and active are set here and an import never overwrites them.
 */
export function EmployeeDirectory({ initial, migrated }: { initial: Employee[]; migrated: boolean }) {
  const [people, setPeople] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const departments = useMemo(() => [...new Set(people.map(person => person.department).filter(Boolean))].sort(), [people]);
  const shown = people.filter(person => (!department || person.department === department)
    && (!query.trim() || `${person.full_name} ${person.nickname} ${person.position}`.toLowerCase().includes(query.trim().toLowerCase())));
  const counts = plan ? { baru: plan.plan.filter(item => item.change === "baru").length, berubah: plan.plan.filter(item => item.change === "berubah").length, sama: plan.plan.filter(item => item.change === "sama").length } : null;

  async function read() {
    if (!file || busy) return;
    setBusy("read"); setError(""); setMessage(""); setPlan(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await adminRequest<Plan>(employeesApi("parse"), { method: "POST", body: form });
      setPlan(result.data ?? null); setMessage(result.message);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(null); }
  }
  async function reload() {
    const result = await adminRequest<{ employees: Employee[] }>(employeesApi());
    setPeople(result.data?.employees ?? []);
  }
  async function save() {
    if (!plan || busy) return;
    setBusy("save"); setError(""); setMessage("");
    try {
      const result = await adminRequest(employeesApi(), { method: "POST", body: JSON.stringify({ rows: plan.plan.map(item => item.row) }) });
      setMessage(result.message); setPlan(null); setFile(null);
      await reload();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(null); }
  }
  async function patch(person: Employee, change: Partial<Employee>) {
    setBusy(person.id); setError(""); setMessage("");
    try {
      const result = await adminRequest<Employee>(employeesApi(person.id), { method: "PATCH", body: JSON.stringify(change) });
      if (result.data) setPeople(list => list.map(item => item.id === person.id ? result.data! : item));
      setMessage(result.message); setEditing(null);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(null); }
  }

  return <div className="stack">
    {!migrated && <Notice tone="warning">Data karyawan menunggu migrasi <code>202611030001_employees.sql</code>. Berkas Excel tetap bisa dibaca untuk dicek, tetapi belum bisa disimpan.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {message && <p role="status" className={styles.guestMessage}>{message}</p>}

    <section className="stack" aria-labelledby="import-title">
      <h2 id="import-title" className={styles.superSectionTitle}><FileSpreadsheet size={20} aria-hidden="true" /> Impor dari Excel HR</h2>
      <p className={styles.lead}>Unggah sheet data karyawan dari HR. Nama, panggilan, departemen, jabatan, dan office dibaca dan dirapikan (huruf kapital dan salah ketik). Setiap orang dicocokkan dengan namanya, jadi impor ulang memperbarui data, tidak menggandakan. Kategori, nomor WhatsApp, email, dan status aktif yang sudah diatur di sini tidak tertimpa. Berkasnya tidak disimpan.</p>
      <Field name="employee-file" label="Berkas Excel (.xlsx)" hint="Sheet dengan kolom Nama karyawan, Nama panggilan, Department, Position, dan Office.">
        <input id="employee-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-describedby="employee-file-hint" onChange={e => { setFile(e.target.files?.[0] ?? null); setPlan(null); }} />
      </Field>
      <div className={styles.qrActions}>
        <Button type="button" variant="secondary" disabled={!file || !!busy} onClick={read}><Upload size={17} aria-hidden="true" /> {busy === "read" ? "Membaca…" : "Baca berkas"}</Button>
      </div>

      {plan && counts && <div className="stack">
        <p><strong>{plan.plan.length} karyawan</strong> dari sheet “{plan.sheet}”: {counts.baru} baru, {counts.berubah} diperbarui, {counts.sama} tetap.</p>
        {plan.skipped.length > 0 && <Notice>{plan.skipped.join(" ")}</Notice>}
        <div className={styles.tableWrap}><table className={styles.table}>
          <caption className="sr-only">Pratinjau impor</caption>
          <thead><tr><th scope="col">Nama</th><th scope="col">Departemen</th><th scope="col">Jabatan</th><th scope="col">Office</th><th scope="col">Hasil</th></tr></thead>
          <tbody>{plan.plan.map(({ row, change, changed }) => <tr key={row.full_name}>
            <td><strong>{row.full_name}</strong>{row.nickname && <p className="field-hint">{row.nickname}</p>}</td>
            <td>{row.department}</td><td>{row.position}</td><td>{row.office}</td>
            <td>{changeLabels[change]}{changed.length > 0 && <p className="field-hint">{changed.map(field => fieldLabels[field]).join(", ")}</p>}</td>
          </tr>)}</tbody>
        </table></div>
        <div className={styles.qrActions}>
          <Button type="button" disabled={!plan.migrated || !!busy || counts.baru + counts.berubah === 0} onClick={save}>{busy === "save" ? "Menyimpan…" : counts.baru + counts.berubah === 0 ? "Tidak ada perubahan" : `Simpan ${counts.baru + counts.berubah} perubahan`}</Button>
          <Button type="button" variant="secondary" disabled={!!busy} onClick={() => setPlan(null)}>Batal</Button>
        </div>
      </div>}
    </section>

    <section className="stack" aria-labelledby="people-title">
      <h2 id="people-title" className={styles.superSectionTitle}>Daftar karyawan · {people.filter(person => person.active).length} aktif</h2>
      <p className={styles.lead}>Dipakai bersama oleh aplikasi Journey, misalnya jatah Kopi Kantor per kategori. Karyawan yang keluar dinonaktifkan, bukan dihapus, supaya catatan lamanya tetap terbaca.</p>
      {people.length > 0 && <div className={styles.grid}>
        <Field name="employee-search" label="Cari"><input id="employee-search" className="input" type="search" value={query} placeholder="Nama, panggilan, atau jabatan" onChange={e => setQuery(e.target.value)} /></Field>
        <Field name="employee-department" label="Departemen"><select id="employee-department" className="input" value={department} onChange={e => setDepartment(e.target.value)}><option value="">Semua departemen</option>{departments.map(name => <option key={name} value={name}>{name}</option>)}</select></Field>
      </div>}
      {people.length === 0 ? <p className="field-hint">Belum ada data karyawan. Impor dari Excel HR di atas.</p>
        : <div className={styles.tableWrap}><table className={styles.table}>
          <caption className="sr-only">Daftar karyawan</caption>
          <thead><tr><th scope="col">Nama</th><th scope="col">Departemen & jabatan</th><th scope="col">Office</th><th scope="col">Kategori</th><th scope="col">Kontak</th><th scope="col">Status</th></tr></thead>
          <tbody>{shown.map(person => <tr key={person.id} aria-busy={busy === person.id}>
            <td><strong>{person.full_name}</strong>{person.nickname && <p className="field-hint">{person.nickname}</p>}</td>
            <td>{person.department}<p className="field-hint">{person.position}</p></td>
            <td>{person.office}</td>
            <td><label className="sr-only" htmlFor={`category-${person.id}`}>Kategori {person.full_name}</label>
              <select id={`category-${person.id}`} className="input" value={person.category} disabled={busy === person.id} onChange={e => patch(person, { category: e.target.value as EmployeeCategory })}>
                {employeeCategories.map(key => <option key={key} value={key}>{categoryLabels[key]}</option>)}
              </select></td>
            <td>{editing === person.id
              ? <ContactForm person={person} busy={busy === person.id} onSave={change => patch(person, change)} onCancel={() => setEditing(null)} />
              : <>{person.phone || person.email ? <><p>{person.phone}</p><p className="field-hint">{person.email}</p></> : <p className="field-hint">Belum ada</p>}
                <Button type="button" variant="quiet" onClick={() => setEditing(person.id)} aria-label={`Ubah kontak ${person.full_name}`}><Pencil size={15} aria-hidden="true" /> Ubah</Button></>}</td>
            <td><label className={styles.superSwitch}>
              <input type="checkbox" role="switch" checked={person.active} disabled={busy === person.id} onChange={e => patch(person, { active: e.target.checked })} aria-label={`${person.full_name} aktif`} />
              <span>{person.active ? "Aktif" : "Nonaktif"}</span>
            </label></td>
          </tr>)}</tbody>
        </table></div>}
      {people.length > 0 && shown.length === 0 && <p className="field-hint">Tidak ada yang cocok dengan pencarian.</p>}
    </section>
  </div>;
}

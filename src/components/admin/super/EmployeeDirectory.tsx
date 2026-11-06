"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, Pencil, Plus, Trash2, Upload, UserPlus } from "lucide-react";
import { Button, Field, Notice } from "@/components/ui";
import { useConfirm } from "@/components/pra-wam/ConfirmDialog";
import { adminRequest, errorMessage } from "@/components/admin/shared/api";
import { categoryLabels, type Employee, type EmployeeRow, type ImportChange } from "@/lib/employees";
import { employeesApi, praWamAccountsApi } from "@/lib/routes";
import type { AccountRow } from "@/lib/server/pra-wam/accounts";
import { BUSINESS_UNITS, buCode, type Leads } from "@/lib/pra-wam/leads";
import type { PraWamRole } from "@/lib/pra-wam/roles";
import { EmployeeEditor, type EmployeeDraft } from "./EmployeeEditor";
import own from "./employee-editor.module.css";
import styles from "@/components/admin/admin.module.css";

type Plan = { sheet: string; skipped: string[]; migrated: boolean; plan: { row: EmployeeRow; change: ImportChange; changed: string[] }[] };
const changeLabels: Record<ImportChange, string> = { baru: "Baru", berubah: "Diperbarui", sama: "Tetap" };
/**
 * WAM sign-ins as Data karyawan shows them: who has one. Each app keeps its own accounts, so
 * another app's (Coffee Werkudara, say) can sit beside this one as its own column later.
 */
export type WamAccounts = { migrated: boolean; passwordReady: boolean; withAccount: string[];
  /** Per person: their WAM roles (BOD, Admin WAM and Panitia), for the structure in the editor. */
  roles?: Record<string, PraWamRole[]> };
type WamStatus = "punya" | "belum" | "tanpa-email" | "nonaktif";
function wamStatus(person: Employee, has: boolean): WamStatus {
  if (!person.active) return "nonaktif";
  if (has) return "punya";
  return person.email.trim() ? "belum" : "tanpa-email";
}
const fieldLabels: Record<string, string> = { full_name: "nama", nickname: "panggilan", department: "departemen", position: "jabatan", office: "office", email: "email", nip: "NIP" };

/**
 * Data karyawan: one list of Werkudara's people for every Journey app. An import from HR's Excel
 * is checked first (who is new, who changed) and saved only on request. The list (6 Nov 2026): a
 * person, their department and job (HOD, lead BU, GA or Intern beside it), their Business Unit,
 * contact and status, with Ubah and Hapus; "Tambah karyawan" adds one by hand. Ubah and Tambah open
 * one panel (EmployeeEditor) with everything, what they head included. `wamAccounts` gives the
 * count of WAM accounts and "Buat akun" for everyone still missing one.
 */
export function EmployeeDirectory({ initial, migrated, wamAccounts, leads: initialLeads, leadOptions }: {
  initial: Employee[]; migrated: boolean; wamAccounts?: WamAccounts | null;
  /** Who heads which departments and BUs (6 Nov 2026), and the names to pick from; no column without them. */
  leads?: Record<string, Leads>; leadOptions?: Leads;
}) {
  const [people, setPeople] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [businessUnit, setBusinessUnit] = useState("");
  const [leads, setLeads] = useState<Record<string, Leads>>(initialLeads ?? {});
  const leadsOf = (id: string): Leads => leads[id] ?? { departments: [], businessUnits: [] };
  const [roles, setRoles] = useState<Record<string, PraWamRole[]>>(wamAccounts?.roles ?? {});
  const rolesOf = (id: string): PraWamRole[] => roles[id] ?? [];
  /** The person being changed, or `null` for a new one; closed when undefined. */
  const [editor, setEditor] = useState<{ person: Employee | null } | undefined>(undefined);
  const [editorError, setEditorError] = useState("");
  const [withAccount, setWithAccount] = useState(() => new Set(wamAccounts?.withAccount ?? []));
  const [skipped, setSkipped] = useState<string[]>([]);
  const [confirm, confirmDialog] = useConfirm();
  const wamReady = !!wamAccounts?.migrated && wamAccounts.passwordReady;
  const canCreate = people.filter(person => wamStatus(person, withAccount.has(person.id)) === "belum");
  const activeCount = people.filter(person => person.active).length;
  const activeWithAccount = people.filter(person => person.active && withAccount.has(person.id)).length;

  const departments = useMemo(() => [...new Set(people.map(person => person.department).filter(Boolean))].sort(), [people]);
  // By Business Unit (MRP, WNS, TEE, NMU, WNN, as listed), then by name A to Z.
  const buRank = (person: Employee) => { const at = (BUSINESS_UNITS as readonly string[]).indexOf(buCode(person.business_unit)); return at < 0 ? BUSINESS_UNITS.length : at; };
  const shown = people.filter(person => (!department || person.department === department) && (!businessUnit || buCode(person.business_unit) === businessUnit)
    && (!query.trim() || `${person.full_name} ${person.nickname} ${person.position}`.toLowerCase().includes(query.trim().toLowerCase())))
    .sort((a, b) => buRank(a) - buRank(b) || a.full_name.localeCompare(b.full_name, "id", { sensitivity: "base" }));
  const counts = plan ? { baru: plan.plan.filter(item => item.change === "baru").length, berubah: plan.plan.filter(item => item.change === "berubah").length, sama: plan.plan.filter(item => item.change === "sama").length } : null;

  async function read() {
    if (!file || busy) return;
    setBusy("read"); setError(""); setMessage(""); setSkipped([]); setPlan(null);
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
    setBusy("save"); setError(""); setMessage(""); setSkipped([]);
    try {
      const result = await adminRequest(employeesApi(), { method: "POST", body: JSON.stringify({ rows: plan.plan.map(item => item.row) }) });
      setMessage(result.message); setPlan(null); setFile(null);
      await reload();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(null); }
  }
  async function patch(person: Employee, change: Partial<Employee>) {
    setBusy(person.id); setError(""); setMessage(""); setSkipped([]);
    try {
      const result = await adminRequest<Employee>(employeesApi(person.id), { method: "PATCH", body: JSON.stringify(change) });
      if (result.data) setPeople(list => list.map(item => item.id === person.id ? result.data! : item));
      setMessage(result.message);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(null); }
  }

  /** Saves the editor: the person (new or changed), then what they head when that changed. */
  async function saveEditor(person: Employee | null, draft: EmployeeDraft, nextLeads: Leads, nextRoles: PraWamRole[]) {
    setBusy("editor"); setEditorError(""); setError(""); setMessage(""); setSkipped([]);
    try {
      let saved: Employee | undefined;
      if (person) {
        const changed = Object.fromEntries(Object.entries(draft).filter(([key, value]) => person[key as keyof Employee] !== value));
        saved = Object.keys(changed).length ? (await adminRequest<Employee>(employeesApi(person.id), { method: "PATCH", body: JSON.stringify(changed) })).data : person;
      } else {
        saved = (await adminRequest<Employee>(employeesApi(), { method: "POST", body: JSON.stringify({ employee: draft }) })).data;
      }
      if (!saved) throw new Error("Belum tersimpan.");
      // The structure: BOD and Admin WAM, and what they head; saved together so the rules hold.
      const before = person ? leadsOf(person.id) : { departments: [], businessUnits: [] };
      const sameLeads = before.departments.join("|") === nextLeads.departments.join("|") && before.businessUnits.join("|") === nextLeads.businessUnits.join("|");
      const rolesBefore = person ? rolesOf(person.id) : [];
      const sameRoles = rolesBefore.length === nextRoles.length && rolesBefore.every(role => nextRoles.includes(role));
      if (!sameLeads || !sameRoles) {
        await adminRequest(praWamAccountsApi(saved.id), { method: "PATCH", body: JSON.stringify({ ...(sameLeads ? {} : { leads: nextLeads }), ...(sameRoles ? {} : { roles: nextRoles }) }) });
        setLeads(current => ({ ...current, [saved!.id]: nextLeads }));
        setRoles(current => ({ ...current, [saved!.id]: nextRoles }));
      }
      const done = saved;
      setPeople(list => person ? list.map(item => item.id === done.id ? done : item) : [done, ...list]);
      setMessage(person ? `${done.full_name} disimpan.` : `${done.full_name} ditambahkan.`);
      setEditor(undefined);
    } catch (err) { setEditorError(errorMessage(err)); }
    finally { setBusy(null); }
  }
  async function remove(person: Employee) {
    if (busy) return;
    if (!(await confirm({
      title: `Hapus ${person.full_name}?`,
      body: "Orang ini hilang dari Data karyawan untuk semua aplikasi dan tidak bisa dikembalikan. Kalau ia keluar dari kantor, lebih baik nonaktifkan saja supaya catatan lamanya tetap terbaca.",
      confirmLabel: "Hapus karyawan", danger: true,
    }))) return;
    setBusy(`delete-${person.id}`); setError(""); setMessage(""); setSkipped([]);
    try {
      const result = await adminRequest(employeesApi(person.id), { method: "DELETE" });
      setPeople(list => list.filter(item => item.id !== person.id));
      setMessage(result.message);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(null); }
  }

  /** One person's WAM account, or (no person) everyone active with an email still missing one. */
  async function createAccounts(person?: Employee) {
    if (busy || !wamReady) return;
    if (!person && !(await confirm({
      title: `Buat akun WAM untuk ${canCreate.length} karyawan?`,
      body: "Setiap karyawan aktif yang belum punya akun mendapat akun WAM dengan email kantornya dan password awal yang sama. Mereka diminta membuat password baru saat pertama masuk.",
      confirmLabel: "Buat akun",
    }))) return;
    const key = person ? `account-${person.id}` : "accounts";
    setBusy(key); setError(""); setMessage(""); setSkipped([]);
    try {
      const result = await adminRequest<{ created: number; skipped: string[]; rows: AccountRow[] }>(praWamAccountsApi(person?.id), { method: "POST" });
      if (result.data) setWithAccount(new Set(result.data.rows.filter(row => row.hasAccount).map(row => row.employeeId)));
      setMessage(person ? result.message : `${result.data?.created ?? 0} akun WAM dibuat${result.data?.skipped.length ? `, ${result.data.skipped.length} dilewati` : ""}.`);
      setSkipped(result.data?.skipped ?? []);
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(null); }
  }

  return <div className="stack">
    {confirmDialog}
    {!migrated && <Notice tone="warning">Data karyawan menunggu migrasi <code>202611030001_employees.sql</code>. Berkas Excel tetap bisa dibaca untuk dicek, tetapi belum bisa disimpan.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {message && <div role="status"><p className={styles.guestMessage}>{message}</p>
      {skipped.length > 0 && <ul aria-label="Dilewati">{skipped.map(item => <li key={item}>{item}</li>)}</ul>}</div>}

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
      <p className={styles.lead}>Dipakai bersama oleh aplikasi Journey. Karyawan yang keluar dinonaktifkan, bukan dihapus, supaya catatan lamanya tetap terbaca.</p>
      {wamAccounts === null && <Notice tone="warning">Status akun WAM belum dapat dimuat. Muat ulang halaman ini sebentar lagi.</Notice>}
      {wamAccounts && !wamAccounts.migrated && <Notice tone="warning">Akun WAM menunggu migrasi 202611040001_pra_wam_appraisal.sql.</Notice>}
      {wamAccounts?.migrated && <div className="stack">
        <p><strong>Akun WAM:</strong> {activeWithAccount} dari {activeCount} karyawan aktif sudah punya akun. Peran diatur di Admin WAM.</p>
        {!wamAccounts.passwordReady && <Notice tone="warning">Password awal WAM belum disiapkan. Isi WAM_DEFAULT_PASSWORD (minimal 8 karakter) pada server, lalu muat ulang halaman ini.</Notice>}
        {canCreate.length > 0 && <div className={styles.qrActions}>
          <Button type="button" variant="secondary" disabled={!!busy || !wamReady} onClick={() => createAccounts()}><UserPlus size={17} aria-hidden="true" /> {busy === "accounts" ? "Membuat akun…" : `Buat akun WAM untuk ${canCreate.length} karyawan`}</Button>
        </div>}
      </div>}

      <div className={own.toolbar}>
        <Field name="employee-search" label="Cari"><input id="employee-search" className="input" type="search" value={query} placeholder="Nama, panggilan, atau jabatan" onChange={e => setQuery(e.target.value)} /></Field>
        <Field name="employee-department" label="Departemen"><select id="employee-department" className="input" value={department} onChange={e => setDepartment(e.target.value)}><option value="">Semua departemen</option>{departments.map(name => <option key={name} value={name}>{name}</option>)}</select></Field>
        <Field name="employee-bu" label="Business Unit"><select id="employee-bu" className="input" value={businessUnit} onChange={e => setBusinessUnit(e.target.value)}><option value="">Semua BU</option>{BUSINESS_UNITS.map(code => <option key={code} value={code}>{code} ({people.filter(person => buCode(person.business_unit) === code).length})</option>)}</select></Field>
        <Button type="button" disabled={!migrated || !!busy} onClick={() => { setEditorError(""); setEditor({ person: null }); }}><Plus size={18} aria-hidden="true" /> Tambah karyawan</Button>
      </div>

      {people.length === 0 ? <p className="field-hint">Belum ada data karyawan. Impor dari Excel HR di atas, atau tambah satu per satu.</p>
        : <div className={styles.tableWrap}><table className={styles.table}>
          <caption className="sr-only">Daftar karyawan</caption>
          <thead><tr><th scope="col">Karyawan</th><th scope="col">Departemen & jabatan</th><th scope="col">Business Unit</th><th scope="col">Kontak</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Aksi</span></th></tr></thead>
          <tbody>{shown.map(person => {
            const led = leadsOf(person.id);
            const hodHere = led.departments.includes(person.department);
            return <tr key={person.id} className={person.active ? undefined : own.inactive} aria-busy={busy === person.id || busy === `delete-${person.id}`}>
              <td className={own.person}><strong>{person.full_name}</strong><p className={own.muted}>{[person.nickname, person.nip && `NIP ${person.nip}`].filter(Boolean).join(" · ") || "—"}</p></td>
              <td>
                <strong>{person.department || "—"}</strong>
                <p className={own.job}>{person.position || "Jabatan belum diisi"}{hodHere ? " · HOD" : ""}</p>
                {(rolesOf(person.id).includes("bod") || led.departments.some(name => name !== person.department) || led.businessUnits.length > 0 || person.category !== "karyawan") && <div className={own.chips}>
                  {rolesOf(person.id).includes("bod") && <span className={`${own.chip} ${own.chipBod}`}>BOD</span>}
                  {led.departments.filter(name => name !== person.department).map(name => <span key={name} className={`${own.chip} ${own.chipHod}`}>HOD {name}</span>)}
                  {led.businessUnits.map(name => <span key={name} className={`${own.chip} ${own.chipLead}`}>Lead BU {buCode(name)}</span>)}
                  {person.category !== "karyawan" && <span className={`${own.chip} ${own.chipWork}`}>{categoryLabels[person.category]}</span>}
                </div>}
              </td>
              <td><span className={own.bu}>{buCode(person.business_unit)}</span></td>
              <td>{person.phone || person.email ? <><p>{person.phone || "—"}</p><p className={own.muted}>{person.email}</p></> : <p className={own.muted}>Belum ada</p>}</td>
              <td><label className={styles.superSwitch}>
                <input type="checkbox" role="switch" checked={person.active} disabled={busy === person.id} onChange={e => patch(person, { active: e.target.checked })} aria-label={`${person.full_name} aktif`} />
                <span>{person.active ? "Aktif" : "Nonaktif"}</span>
              </label></td>
              <td><div className={own.actions}>
                <button type="button" className={own.iconButton} disabled={!!busy} onClick={() => { setEditorError(""); setEditor({ person }); }} aria-label={`Ubah ${person.full_name}`} title="Ubah"><Pencil size={18} aria-hidden="true" /></button>
                <button type="button" className={`${own.iconButton} ${own.danger}`} disabled={!!busy} onClick={() => void remove(person)} aria-label={`Hapus ${person.full_name}`} title="Hapus"><Trash2 size={18} aria-hidden="true" /></button>
              </div></td>
            </tr>;
          })}</tbody>
        </table></div>}
      {people.length > 0 && shown.length === 0 && <p className="field-hint">Tidak ada yang cocok dengan pencarian.</p>}
    </section>

    {editor && <EmployeeEditor key={editor.person?.id ?? "baru"} person={editor.person} leads={editor.person ? leadsOf(editor.person.id) : { departments: [], businessUnits: [] }}
      roles={editor.person ? rolesOf(editor.person.id) : []}
      options={leadOptions ?? null} departments={departments} saving={busy === "editor"} error={editorError}
      onSave={(draft, nextLeads, nextRoles) => void saveEditor(editor.person, draft, nextLeads, nextRoles)} onClose={() => setEditor(undefined)} />}
  </div>;
}

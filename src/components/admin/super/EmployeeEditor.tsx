"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { LeadEditor } from "@/components/admin/wam/akun/LeadEditor";
import { categoryLabels, employeeCategories, type Employee, type EmployeeCategory } from "@/lib/employees";
import { BUSINESS_UNITS, DEFAULT_BUSINESS_UNIT, buCode, buFromOffice, type Leads } from "@/lib/pra-wam/leads";
import type { PraWamRole } from "@/lib/pra-wam/roles";
import css from "./employee-editor.module.css";

export type EmployeeDraft = Omit<Employee, "id" | "active">;

const blank: EmployeeDraft = { full_name: "", nickname: "", department: "", position: "", office: "", category: "karyawan", phone: "", email: "", nip: "", business_unit: DEFAULT_BUSINESS_UNIT };
const draftOf = (person: Employee | null): EmployeeDraft => person
  ? { full_name: person.full_name, nickname: person.nickname, department: person.department, position: person.position, office: person.office, category: person.category, phone: person.phone, email: person.email, nip: person.nip, business_unit: buCode(person.business_unit) }
  : blank;

/**
 * Tambah karyawan or Ubah karyawan (6 Nov 2026): one panel from the side (from the bottom on a
 * phone) with everything about a person: Identitas, Pekerjaan, Kontak, and Struktur dan akses (BOD,
 * Admin WAM, HOD departemen, lead BU: the structure lives here, Admin WAM only picks Panitia), with one Simpan. GA and Intern are a person's kind of work, so they sit under Pekerjaan.
 * A native <dialog>: Esc, the dimmed page or X close it without saving.
 */
export function EmployeeEditor({ person, leads, roles, options, departments, saving, error, onSave, onClose }: {
  /** The person to change; null adds a new one. */
  person: Employee | null;
  leads: Leads;
  /** Their WAM roles: BOD and Admin WAM are set here; Panitia stays with Admin WAM and is kept as it is. */
  roles: PraWamRole[];
  /** The departments and BUs to pick from (HOD and lead BU). */
  options: Leads | null;
  /** The departments already in Data karyawan, offered while typing. */
  departments: string[];
  saving: boolean;
  error: string;
  onSave: (draft: EmployeeDraft, leads: Leads, roles: PraWamRole[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [draft, setDraft] = useState<EmployeeDraft>(() => draftOf(person));
  const [nextLeads, setNextLeads] = useState<Leads>(leads);
  const [nextRoles, setNextRoles] = useState<PraWamRole[]>(roles);
  const isBod = nextRoles.includes("bod");
  const heads = nextLeads.departments.length + nextLeads.businessUnits.length > 0;
  const toggleRole = (role: PraWamRole) => setNextRoles(current => current.includes(role) ? current.filter(item => item !== role) : [...current, role]);
  const [problems, setProblems] = useState<Partial<Record<keyof EmployeeDraft, string>>>({});
  const set = (patch: Partial<EmployeeDraft>) => { setDraft(current => ({ ...current, ...patch })); setProblems({}); };

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const before = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal?.();
    return () => { if (dialog.open) dialog.close?.(); before?.focus?.(); };
  }, []);

  function submit() {
    const found: typeof problems = {};
    if (draft.full_name.trim().length < 2) found.full_name = "Isi nama lengkap.";
    if (!draft.department.trim()) found.department = "Isi departemen.";
    if (!draft.position.trim()) found.position = "Isi jabatan.";
    if (draft.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim())) found.email = "Email tidak valid.";
    if (Object.keys(found).length) { setProblems(found); return; }
    onSave({ ...draft, full_name: draft.full_name.trim(), department: draft.department.trim(), position: draft.position.trim() }, nextLeads, nextRoles);
  }

  const field = (key: keyof EmployeeDraft, label: string, input: React.ReactNode, hint?: string) => <div className={css.field}>
    <label htmlFor={`${id}-${key}`}>{label}</label>
    {input}
    {problems[key] ? <p id={`${id}-${key}-error`} className={css.error}>{problems[key]}</p> : hint ? <p className={css.hint}>{hint}</p> : null}
  </div>;
  const text = (key: keyof EmployeeDraft, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <input id={`${id}-${key}`} className="input" value={String(draft[key] ?? "")}
    aria-invalid={!!problems[key]} aria-describedby={problems[key] ? `${id}-${key}-error` : undefined} onChange={event => set({ [key]: event.target.value } as Partial<EmployeeDraft>)} {...extra} />;

  return <dialog ref={ref} className={css.sheet} aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === ref.current) onClose(); }}>
    <form className={css.inner} onSubmit={event => { event.preventDefault(); submit(); }} noValidate>
      <header className={css.head}>
        <div>
          <h2 id={`${id}-title`}>{person ? "Ubah karyawan" : "Tambah karyawan"}</h2>
          <p>{person ? person.full_name : "Isi data orang baru. Yang bertanda * wajib."}</p>
        </div>
        <button type="button" className={css.close} onClick={onClose} aria-label="Tutup"><X size={22} aria-hidden /></button>
      </header>

      <div className={css.body}>
        {error && <Notice tone="error">{error}</Notice>}

        <fieldset className={css.group}>
          <legend>Identitas</legend>
          {field("full_name", "Nama lengkap *", text("full_name", { maxLength: 150, autoComplete: "off" }))}
          <div className={css.pair}>
            {field("nickname", "Nama panggilan", text("nickname", { maxLength: 60 }))}
            {field("nip", "NIP", text("nip", { maxLength: 30 }), "Boleh kosong dulu.")}
          </div>
        </fieldset>

        <fieldset className={css.group}>
          <legend>Pekerjaan</legend>
          {field("department", "Departemen *", <>
            {text("department", { maxLength: 150, list: `${id}-departments`, placeholder: "Pilih atau ketik" })}
            <datalist id={`${id}-departments`}>{departments.map(name => <option key={name} value={name} />)}</datalist>
          </>)}
          {field("position", "Jabatan *", text("position", { maxLength: 150, placeholder: "Mis. Business Solutions Manager" }))}
          <div className={css.field}>
            <span className={css.label} id={`${id}-category`}>Status kerja</span>
            <div className={css.segmented} role="radiogroup" aria-labelledby={`${id}-category`}>
              {employeeCategories.map(key => <label key={key} className={css.segment}>
                <input type="radio" name={`${id}-category`} value={key} checked={draft.category === key} onChange={() => set({ category: key as EmployeeCategory })} />
                <span>{categoryLabels[key]}</span>
              </label>)}
            </div>
          </div>
          <div className={css.pair}>
            {field("business_unit", "Business Unit", <select id={`${id}-business_unit`} className="input" value={draft.business_unit} onChange={event => set({ business_unit: event.target.value })}>
              {[...new Set([...BUSINESS_UNITS, draft.business_unit])].map(code => <option key={code} value={code}>{code}</option>)}
            </select>)}
            {field("office", "Office", <input id={`${id}-office`} className="input" value={draft.office} maxLength={20} placeholder="Mis. WNS"
              onChange={event => { const office = event.target.value; const bu = buFromOffice(office); set({ office, ...(bu ? { business_unit: bu } : {}) }); }} />, "Kode office yang sama dengan BU ikut mengisi Business Unit.")}
          </div>
        </fieldset>

        <fieldset className={css.group}>
          <legend>Kontak</legend>
          <div className={css.pair}>
            {field("phone", "Nomor WhatsApp", text("phone", { maxLength: 30, inputMode: "tel", placeholder: "0812 3456 7890" }))}
            {field("email", "Email kantor", text("email", { maxLength: 200, type: "email" }), "Juga email login WAM.")}
          </div>
        </fieldset>

        <fieldset className={css.group}>
          <legend>Struktur dan akses</legend>
          <p className={css.hint}>Diatur di sini saja; Admin WAM hanya memilih Panitia. BOD berdiri sendiri: tidak memimpin departemen atau BU, dan bukan Panitia atau Admin WAM.</p>
          <div className={css.roleTicks}>
            <label className={css.roleTick}>
              <input type="checkbox" checked={isBod} disabled={!isBod && (heads || nextRoles.includes("panitia") || nextRoles.includes("admin"))} onChange={() => toggleRole("bod")} />
              <span>BOD<small>Melihat Ringkasan dan semua sesi, tanpa mengubah.</small></span>
            </label>
            <label className={css.roleTick}>
              <input type="checkbox" checked={nextRoles.includes("admin")} disabled={isBod} onChange={() => toggleRole("admin")} />
              <span>Admin WAM<small>Mengatur aplikasi WAM: akun, ruang, acara.</small></span>
            </label>
          </div>
          {!isBod && (heads || nextRoles.includes("panitia") || nextRoles.includes("admin")) && <p className={css.hint}>BOD terkunci karena orang ini {heads ? "memimpin departemen atau BU" : nextRoles.includes("admin") ? "Admin WAM" : "Panitia"}.</p>}
        </fieldset>

        {options && <LeadEditor name={draft.full_name || "karyawan baru"} value={leads} options={options} onChange={setNextLeads} className={css.group}
          locked={isBod ? "BOD tidak memimpin departemen atau BU. Lepas BOD dulu untuk mengisinya." : undefined} />}
      </div>

      <footer className={css.foot}>
        <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Batal</Button>
        <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : person ? "Simpan perubahan" : "Tambah karyawan"}</Button>
      </footer>
    </form>
  </dialog>;
}

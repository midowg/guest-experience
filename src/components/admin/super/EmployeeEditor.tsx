"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button, Notice } from "@/components/ui";
import { MAX_JOBS, categoryLabels, employeeCategories, jobPostLabels, jobPosts, primaryFields, tidyJob, type Employee, type EmployeeCategory, type EmployeeJob, type JobPost } from "@/lib/employees";
import { BUSINESS_UNITS, DEFAULT_BUSINESS_UNIT, buCode, leadDepartments, type Leads } from "@/lib/pra-wam/leads";
import { GENDERS, asGender, genderLabels } from "@/lib/pra-wam/call-name";
import type { PraWamRole } from "@/lib/pra-wam/roles";
import css from "./employee-editor.module.css";

export type EmployeeDraft = Omit<Employee, "id" | "active">;

/** A new job card: the Utama job's BU, a Jabatan to fill. */
export const blankJob = (business_unit: string = DEFAULT_BUSINESS_UNIT): EmployeeJob => ({ business_unit, department: "", post: "staf", job_title: "", reports_to: null });
const JOBS_MIGRATION = "202611090003_employee_jobs.sql";

const blank: EmployeeDraft = { full_name: "", nickname: "", department: "", position: "", office: "", category: "karyawan", phone: "", email: "", nip: "", business_unit: DEFAULT_BUSINESS_UNIT, reports_to: null, gender: "" };
const draftOf = (person: Employee | null): EmployeeDraft => person
  ? { full_name: person.full_name, nickname: person.nickname, department: person.department, position: person.position, office: person.office, category: person.category, phone: person.phone, email: person.email, nip: person.nip, business_unit: buCode(person.business_unit), reports_to: person.reports_to ?? null, gender: person.gender ?? "" }
  : blank;

/**
 * Tambah karyawan or Ubah karyawan (6 Nov 2026): one panel from the side (from the bottom on a
 * phone) with everything about a person: Identitas, Pekerjaan, Kontak, and Struktur dan akses (BOD
 * and Admin WAM: the structure lives here, Admin WAM only picks Panitia), with one Simpan. Fields go
 * two by two so both columns line up (9 Nov 2026).
 *
 * Pekerjaan (9 Nov 2026): one card per job, in order Business Unit, Departemen, Posisi (HOD, Lead or
 * a Jabatan with its title and who it is under: the HOD or a Lead of that department). The first is
 * the Utama job, copied to the person's own columns; Tambah pekerjaan adds one in another BU, with
 * its own department and job. HOD and Lead are picked here, so there is no separate HOD/Lead part.
 * HR's "office" holds the BU code (WNS, TEE, MRP...), so the Utama BU writes the office too; an
 * office that is no BU code is kept. GA and Intern (Status kerja) are one per person.
 * A native <dialog>: Esc, the dimmed page or X close it without saving.
 */
export function EmployeeEditor({ person, jobs: initialJobs, roles, departments, people = [], leads = {}, jobsReady = true, saving, error, onSave, onClose }: {
  /** The person to change; null adds a new one. */
  person: Employee | null;
  /** Their jobs, the Utama one first; a new person starts with one empty card. */
  jobs?: EmployeeJob[];
  /** Their WAM roles: BOD and Admin WAM are set here; Panitia stays with Admin WAM and is kept as it is. */
  roles: PraWamRole[];
  /** The departments already in Data karyawan, offered while typing. */
  departments: string[];
  /** Everyone active, for Di bawah. */
  people?: Employee[];
  /** What everyone heads (HOD and Lead), for Di bawah. */
  leads?: Record<string, Leads>;
  /** False while employee_jobs waits for its migration: only the Utama job is kept. */
  jobsReady?: boolean;
  saving: boolean;
  error: string;
  onSave: (draft: EmployeeDraft, jobs: EmployeeJob[], roles: PraWamRole[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [draft, setDraft] = useState<EmployeeDraft>(() => draftOf(person));
  const [jobs, setJobs] = useState<EmployeeJob[]>(() => initialJobs?.length ? initialJobs.map(tidyJob) : [blankJob(person ? buCode(person.business_unit) : DEFAULT_BUSINESS_UNIT)]);
  // Stable keys, so removing a card keeps what was typed in the others.
  const [keys, setKeys] = useState<number[]>(() => jobs.map((_, index) => index));
  const nextKey = useRef(jobs.length);
  const [nextRoles, setNextRoles] = useState<PraWamRole[]>(roles);
  const isBod = nextRoles.includes("bod");
  const heads = jobs.some(job => job.post !== "staf");
  const toggleRole = (role: PraWamRole) => setNextRoles(current => current.includes(role) ? current.filter(item => item !== role) : [...current, role]);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const set = (patch: Partial<EmployeeDraft>) => { setDraft(current => ({ ...current, ...patch })); setProblems({}); };
  const setJob = (index: number, patch: Partial<EmployeeJob>) => { setJobs(current => current.map((job, at) => at === index ? { ...job, ...patch } : job)); setProblems({}); };
  const addJob = () => {
    const key = nextKey.current++;
    setJobs(current => [...current, blankJob(current[0]?.business_unit)]);
    setKeys(current => [...current, key]);
  };
  const removeJob = (index: number) => {
    if (index === 0) return;
    setJobs(current => current.filter((_, at) => at !== index));
    setKeys(current => current.filter((_, at) => at !== index));
    setProblems({});
  };

  const nameOf = (personId: string) => people.find(item => item.id === personId)?.full_name ?? "";
  /** Who a Jabatan in this department can be under: the HOD (null) or one of its Leads. */
  const under = (department: string, current: string | null) => {
    const name = department.trim();
    const hods = name ? Object.entries(leads).filter(([personId, led]) => personId !== person?.id && led.departments.includes(name)).map(([personId]) => nameOf(personId)).filter(Boolean).sort((a, b) => a.localeCompare(b, "id")) : [];
    const leadsHere = name ? people.filter(item => item.id !== person?.id && leadDepartments(leads[item.id], item.department).includes(name)).sort((a, b) => a.full_name.localeCompare(b.full_name, "id")) : [];
    // Someone set before as Atasan langsung who is no Lead here stays, so opening the panel loses nothing.
    const kept = current && !leadsHere.some(item => item.id === current) ? people.find(item => item.id === current) : undefined;
    return { hods, leadsHere, kept };
  };

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
    jobs.forEach((job, index) => {
      if (!job.department.trim()) found[`job${index}-department`] = "Isi departemen.";
      if (job.post === "staf" && !job.job_title.trim()) found[`job${index}-job_title`] = "Isi nama jabatan.";
    });
    if (draft.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim())) found.email = "Email tidak valid.";
    if (Object.keys(found).length) { setProblems(found); return; }
    const saved = jobs.map(tidyJob);
    // The Utama job fills the person's own columns; an empty office takes the BU's code.
    onSave({ ...draft, full_name: draft.full_name.trim(), ...primaryFields(saved, draft.office) }, saved, nextRoles);
  }

  const field = (key: string, label: string, input: React.ReactNode, hint?: string) => <div className={css.field}>
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
          <div className={css.pair}>
            {field("full_name", "Nama lengkap *", text("full_name", { maxLength: 150, autoComplete: "off" }))}
            {field("nickname", "Nama panggilan", text("nickname", { maxLength: 60 }))}
          </div>
          <div className={css.pair}>
            {field("nip", "NIP", text("nip", { maxLength: 30 }), "Boleh kosong dulu.")}
            {field("gender", "Jenis kelamin", <select id={`${id}-gender`} className="input" value={draft.gender ?? ""} onChange={event => set({ gender: asGender(event.target.value) })}>
              {GENDERS.map(key => <option key={key} value={key}>{genderLabels[key]}</option>)}
            </select>, "Untuk sapaan Pak atau Bu (BOD, HOD, Lead).")}
          </div>
        </fieldset>

        <fieldset className={css.group}>
          <legend>Pekerjaan</legend>
          <p className={css.hint}>Isi berurutan: Business Unit, departemen, lalu posisi. Pekerjaan utama tampil di daftar dan struktur. Tambah pekerjaan bila ia juga bekerja di BU lain.</p>
          <datalist id={`${id}-departments`}>{departments.map(name => <option key={name} value={name} />)}</datalist>
          {jobs.map((job, index) => {
            const key = `job${index}`;
            const { hods, leadsHere, kept } = under(job.department, job.reports_to);
            const title = index === 0 ? "Pekerjaan utama" : `Pekerjaan ${index + 1}`;
            const postName = `${jobPostLabels[job.post]} ${job.department.trim()}`.trim();
            return <section key={keys[index]} className={css.job} aria-labelledby={`${id}-${key}-title`}>
              <div className={css.jobHead}>
                <h3 id={`${id}-${key}-title`}>{title}</h3>
                {index > 0 && <button type="button" className={css.jobRemove} onClick={() => removeJob(index)} aria-label={`Hapus ${title.toLowerCase()}`} title="Hapus"><Trash2 size={18} aria-hidden /></button>}
              </div>
              <div className={css.pair}>
                {field(`${key}-business_unit`, "Business Unit", <select id={`${id}-${key}-business_unit`} className="input" value={job.business_unit} onChange={event => setJob(index, { business_unit: event.target.value })}>
                  {[...new Set([...BUSINESS_UNITS, job.business_unit])].map(code => <option key={code} value={code}>{code}</option>)}
                </select>, index === 0 ? "Unit usaha di Werkudara Group (juga Office di data HR)." : undefined)}
                {field(`${key}-department`, "Departemen *", <input id={`${id}-${key}-department`} className="input" value={job.department} maxLength={150} list={`${id}-departments`} placeholder="Pilih atau ketik"
                  aria-invalid={!!problems[`${key}-department`]} aria-describedby={problems[`${key}-department`] ? `${id}-${key}-department-error` : undefined}
                  onChange={event => {
                    const department = event.target.value;
                    // A Lead picked in Di bawah leads the old department: back to the HOD unless they lead this one too.
                    const boss = job.reports_to ? people.find(item => item.id === job.reports_to) : undefined;
                    const stays = !job.reports_to || leadDepartments(leads[job.reports_to], boss?.department).includes(department.trim());
                    setJob(index, { department, ...(stays ? {} : { reports_to: null }) });
                  }} />)}
              </div>
              <div className={css.field}>
                <span className={css.label} id={`${id}-${key}-post`}>Posisi</span>
                <div className={css.segmented} role="radiogroup" aria-labelledby={`${id}-${key}-post`}>
                  {jobPosts.map(post => <label key={post} className={css.segment}>
                    <input type="radio" name={`${id}-${key}-post`} value={post} checked={job.post === post} disabled={isBod && post !== "staf"}
                      onChange={() => setJob(index, { post: post as JobPost, ...(post === "staf" ? {} : { reports_to: null }) })} />
                    <span>{jobPostLabels[post]}</span>
                  </label>)}
                </div>
                {isBod && <p className={css.hint}>BOD bukan HOD atau Lead. Lepas BOD dulu untuk memilihnya.</p>}
              </div>
              <div className={css.pair}>
                {field(`${key}-job_title`, job.post === "staf" ? "Nama jabatan *" : "Nama jabatan", <input id={`${id}-${key}-job_title`} className="input" value={job.job_title} maxLength={150}
                  placeholder={job.post === "staf" ? "Mis. Business Solutions Manager" : postName}
                  aria-invalid={!!problems[`${key}-job_title`]} aria-describedby={problems[`${key}-job_title`] ? `${id}-${key}-job_title-error` : undefined}
                  onChange={event => setJob(index, { job_title: event.target.value })} />,
                  job.post === "staf" ? undefined : `Boleh kosong: tampil sebagai ${job.department.trim() ? postName : jobPostLabels[job.post]}.`)}
                {job.post === "staf"
                  ? field(`${key}-reports_to`, "Di bawah", <select id={`${id}-${key}-reports_to`} className="input" value={job.reports_to ?? ""} onChange={event => setJob(index, { reports_to: event.target.value || null })}>
                    <option value="">{`HOD ${job.department.trim() || "departemen"}${hods.length ? ` · ${hods.join(", ")}` : ""}`}</option>
                    {leadsHere.map(item => <option key={item.id} value={item.id}>{`Lead · ${item.full_name}`}</option>)}
                    {kept && <option value={kept.id}>{`${kept.full_name} (atasan sekarang)`}</option>}
                  </select>, leadsHere.length ? "Langsung di bawah HOD, atau di bawah salah satu Lead departemen ini." : "Departemen ini belum punya Lead, jadi langsung di bawah HOD.")
                  : <p className={css.hint}>{job.post === "lead" ? "Lead otomatis di bawah HOD departemennya." : "HOD memimpin departemen ini."}</p>}
              </div>
            </section>;
          })}
          <div className={css.jobAdd}>
            <Button type="button" variant="secondary" disabled={jobs.length >= MAX_JOBS} onClick={addJob}><Plus size={17} aria-hidden /> Tambah pekerjaan</Button>
            {!jobsReady && jobs.length > 1 && <p className={css.hint}>Pekerjaan selain utama baru tersimpan setelah migrasi {JOBS_MIGRATION}.</p>}
          </div>
          <div className={css.field}>
            <span className={css.label} id={`${id}-category`}>Status kerja</span>
            <div className={css.segmented} role="radiogroup" aria-labelledby={`${id}-category`}>
              {employeeCategories.map(key => <label key={key} className={css.segment}>
                <input type="radio" name={`${id}-category`} value={key} checked={draft.category === key} onChange={() => set({ category: key as EmployeeCategory })} />
                <span>{categoryLabels[key]}</span>
              </label>)}
            </div>
          </div>
        </fieldset>

        <fieldset className={css.group}>
          <legend>Kontak</legend>
          <div className={css.pair}>
            {field("phone", "Nomor WhatsApp", text("phone", { maxLength: 30, inputMode: "tel", placeholder: "0812 3456 7890" }), "Nomor aktif untuk WhatsApp.")}
            {field("email", "Email kantor", text("email", { maxLength: 200, type: "email" }), "Juga email login WAM.")}
          </div>
        </fieldset>

        <fieldset className={css.group}>
          <legend>Struktur dan akses</legend>
          <p className={css.hint}>Diatur di sini saja; Admin WAM hanya memilih Panitia. BOD berdiri sendiri: bukan HOD atau Lead, dan bukan Panitia atau Admin WAM. HOD dan Lead dipilih di Posisi tiap pekerjaan.</p>
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
          {!isBod && (heads || nextRoles.includes("panitia") || nextRoles.includes("admin")) && <p className={css.hint}>BOD terkunci karena orang ini {heads ? "HOD atau Lead" : nextRoles.includes("admin") ? "Admin WAM" : "Panitia"}.</p>}
        </fieldset>
      </div>

      <footer className={css.foot}>
        <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Batal</Button>
        <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : person ? "Simpan perubahan" : "Tambah karyawan"}</Button>
      </footer>
    </form>
  </dialog>;
}

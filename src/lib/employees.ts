import { GENDERS, type Gender } from "@/lib/pra-wam/call-name";
import { buCode, buFromOffice, leadDepartments, type Leads } from "@/lib/pra-wam/leads";
import { z } from "zod";

/*
 * Data karyawan: Werkudara's people, shared by every Journey app. HR keeps an Excel sheet; the
 * import reads it, tidies the capitals and the known typos, and matches each person by name so a
 * second import updates rather than doubles. Gender is in HR's sheet but no app needs it, so it is
 * left out.
 */

export const employeeCategories = ["karyawan", "ga", "intern"] as const;
export type EmployeeCategory = (typeof employeeCategories)[number];
export const categoryLabels: Record<EmployeeCategory, string> = { karyawan: "Karyawan", ga: "GA", intern: "Intern" };

export type Employee = {
  id: string; full_name: string; nickname: string; department: string; position: string; office: string;
  category: EmployeeCategory; phone: string; email: string; active: boolean;
  /** Nomor induk; empty until HR fills it (column from migration 202611040002). */
  nip: string;
  /** Business unit by code: MRP, WNS, TEE, NMU or WNN (migrations 202611060002, 202611060004); "" before them. */
  business_unit: string;
  /** Atasan langsung, for the Struktur tab (migration 202611060006); null for the usual place. */
  reports_to?: string | null;
  /** Jenis kelamin, for Pak or Bu in the WAM app (migration 202611060007): "L", "P" or "". */
  gender?: Gender;
};
/** One person as read from HR's sheet; `email` and `nip` only when the sheet has them. */
export type EmployeeRow = Pick<Employee, "full_name" | "nickname" | "department" | "position" | "office" | "category"> & { email?: string; nip?: string };
const NIP = /^[0-9A-Za-z.-]{1,30}$/;

const text = (max: number) => z.string().trim().max(max);
export const employeeRowSchema = z.object({
  full_name: text(150).min(2, "Nama terlalu pendek."), nickname: text(60), department: text(150), position: text(150), office: text(20),
  category: z.enum(employeeCategories), email: z.union([z.literal(""), z.email("Email tidak valid.").max(200)]).optional(),
  nip: z.string().regex(NIP, "NIP hanya angka, huruf, titik, atau strip.").optional(),
});
export const employeeImportSchema = z.object({ rows: z.array(employeeRowSchema).min(1, "Tidak ada karyawan untuk disimpan.").max(2000) });
export const employeePatchSchema = z.object({
  full_name: text(150).min(2), nickname: text(60), department: text(150), position: text(150), office: text(20),
  category: z.enum(employeeCategories), phone: text(30), email: z.union([z.literal(""), z.email("Email tidak valid.").max(200)]), active: z.boolean(),
  nip: z.union([z.literal(""), z.string().trim().regex(NIP, "NIP hanya angka, huruf, titik, atau strip.")]),
  business_unit: text(120).min(1, "Pilih Business Unit."),
  reports_to: z.union([z.uuid(), z.null()]),
  gender: z.enum(GENDERS),
}).partial();
/** A person added by hand (Tambah karyawan): the name, department and job at least. */
export const employeeCreateSchema = z.object({
  full_name: text(150).min(2, "Isi nama lengkap."), nickname: text(60).default(""), department: text(150).min(1, "Pilih departemen."),
  position: text(150).min(1, "Isi jabatan."), office: text(20).default(""), category: z.enum(employeeCategories).default("karyawan"),
  phone: text(30).default(""), email: z.union([z.literal(""), z.email("Email tidak valid.").max(200)]).default(""),
  nip: z.union([z.literal(""), z.string().trim().regex(NIP, "NIP hanya angka, huruf, titik, atau strip.")]).default(""),
  business_unit: text(120).min(1).default("WNS"), active: z.boolean().default(true),
  reports_to: z.union([z.uuid(), z.null()]).default(null),
  gender: z.enum(GENDERS).default(""),
});

/*
 * Pekerjaan (9 Nov 2026, migration 202611090003_employee_jobs.sql): one person may hold more than
 * one job, each in a Business Unit with its own department and post. A post is HOD, Lead (a team
 * lead under the HOD) or a Jabatan with its title and who it is under: the HOD (null) or a Lead.
 * The first job is the Utama one and is copied to the employees columns (department, position,
 * business_unit, office, reports_to); pw_leads keeps a row per HOD and Lead job.
 *
 * From the org chart of 10 Nov 2026 (migration 202611100001): a GM heads a department like a HOD
 * (and counts as one everywhere the app reads HOD), a HOD may sit under their GM, and a job may
 * name its team inside the department (`unit`: Business Solutions, Commercial...).
 */
export const jobPosts = ["gm", "hod", "lead", "staf"] as const;
export type JobPost = (typeof jobPosts)[number];
export const jobPostLabels: Record<JobPost, string> = { gm: "GM", hod: "HOD", lead: "Lead", staf: "Jabatan" };
/** Heads a department: GM or HOD (pw_leads 'departemen'). */
export const headsDepartment = (post: JobPost) => post === "gm" || post === "hod";
/** May sit under someone: a Jabatan (under the head, a Lead or a colleague) and a HOD (under their GM). */
export const mayReport = (post: JobPost) => post === "staf" || post === "hod";
/** `unit`: the team inside the department, absent when none. */
export type EmployeeJob = { business_unit: string; department: string; unit?: string; post: JobPost; job_title: string; reports_to: string | null };
export const MAX_JOBS = 10;
export const employeeJobSchema = z.object({
  business_unit: text(120).min(1, "Pilih Business Unit."),
  department: text(150).min(1, "Isi departemen."),
  unit: text(120).optional(),
  post: z.enum(jobPosts),
  job_title: text(150).default(""),
  reports_to: z.union([z.uuid(), z.null()]).default(null),
}).refine(job => job.post !== "staf" || job.job_title.length > 0, { message: "Isi nama jabatan.", path: ["job_title"] });
export const employeeJobsSchema = z.array(employeeJobSchema).min(1, "Isi pekerjaan utama.").max(MAX_JOBS, `Paling banyak ${MAX_JOBS} pekerjaan.`);

/** Trimmed; a GM or a Lead sits under nobody here (a Lead is under the head of the department by rule). */
export function tidyJob(job: EmployeeJob): EmployeeJob {
  const post = job.post;
  const unit = (job.unit ?? "").trim();
  return { business_unit: buCode(job.business_unit), department: job.department.trim(), ...(unit ? { unit } : {}), post, job_title: job.job_title.trim(), reports_to: mayReport(post) ? job.reports_to || null : null };
}
/** The title shown and copied to employees: the job's own, else "HOD Accounting" or "Lead Accounting". */
export function jobTitleOf(job: EmployeeJob): string {
  const own = job.job_title.trim();
  if (own || job.post === "staf") return own;
  return `${jobPostLabels[job.post]} ${job.department.trim()}`.trim();
}
/** The Utama job as the employees columns; an office that is no BU code (HR's own) is kept. */
export function primaryFields(jobs: EmployeeJob[], office: string): Pick<Employee, "department" | "position" | "business_unit" | "office" | "reports_to"> {
  const job = tidyJob(jobs[0]);
  return { department: job.department, position: jobTitleOf(job), business_unit: job.business_unit, office: !office.trim() || buFromOffice(office) ? job.business_unit : office.trim(), reports_to: job.reports_to };
}
/** What a person heads, from their jobs (for pw_leads). */
export function leadsFromJobs(jobs: EmployeeJob[]): Leads {
  const of = (post: JobPost) => [...new Set(jobs.filter(job => job.post === post).map(job => job.department.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
  const leadIn = of("lead");
  // A GM heads their department like a HOD.
  return { departments: [...new Set([...of("gm"), ...of("hod")])].sort((a, b) => a.localeCompare(b, "id")), lead: leadIn.length > 0, leadIn };
}
export const sameJobs = (a: EmployeeJob[], b: EmployeeJob[]) => JSON.stringify(a.map(tidyJob)) === JSON.stringify(b.map(tidyJob));

type JobPerson = Pick<Employee, "department" | "position" | "business_unit"> & { reports_to?: string | null };
/**
 * A person's jobs from the employees columns and what they head, for someone without rows in
 * employee_jobs (before its migration, or added since): the Utama job, then a HOD job for every
 * other department they head and a Lead job for every other department they lead.
 */
export function jobsFromEmployee(person: JobPerson, leads?: Leads): EmployeeJob[] {
  const department = person.department.trim();
  const business_unit = buCode(person.business_unit);
  const headed = leads?.departments ?? [];
  const led = leadDepartments(leads, department);
  const post: JobPost = headed.includes(department) ? "hod" : led.includes(department) ? "lead" : "staf";
  const jobs: EmployeeJob[] = [{ business_unit, department, post, job_title: person.position.trim(), reports_to: mayReport(post) ? person.reports_to ?? null : null }];
  for (const name of headed) if (name !== department) jobs.push({ business_unit, department: name, post: "hod", job_title: "", reports_to: null });
  for (const name of led) if (name !== department && !headed.includes(name)) jobs.push({ business_unit, department: name, post: "lead", job_title: "", reports_to: null });
  return jobs.slice(0, MAX_JOBS);
}

/**
 * A person's saved jobs made to agree with what the app reads elsewhere: the Utama job with the
 * employees columns (an Excel import may have changed them), and the posts with pw_leads (`leads`,
 * when it is read): a HOD or Lead no longer there becomes a Jabatan, and one only there is added.
 */
export function reconcileJobs(rows: EmployeeJob[], person: JobPerson, leads?: Leads): EmployeeJob[] {
  if (!rows.length) return jobsFromEmployee(person, leads);
  const jobs = rows.map(tidyJob);
  const first = jobs[0];
  const title = person.position.trim();
  jobs[0] = { ...first, business_unit: buCode(person.business_unit), department: person.department.trim() || first.department,
    // "HOD Accounting" was written for a HOD job without a title of its own: it stays without one.
    job_title: title === jobTitleOf({ ...first, job_title: "" }) ? first.job_title : title,
    reports_to: mayReport(first.post) ? person.reports_to ?? null : null };
  if (!leads) return jobs;
  const headed = leads.departments;
  const led = leadDepartments(leads, jobs[0].department);
  for (const job of jobs) {
    if ((headsDepartment(job.post) && !headed.includes(job.department)) || (job.post === "lead" && !led.includes(job.department))) { job.post = "staf"; }
  }
  const ensure = (name: string, post: "hod" | "lead") => {
    if (jobs.some(job => job.department === name && (job.post === post || headsDepartment(job.post)))) return;
    const same = jobs.find(job => job.department === name && job.post === "staf");
    if (same) { same.post = post; if (!mayReport(post)) same.reports_to = null; }
    else if (jobs.length < MAX_JOBS) jobs.push({ business_unit: jobs[0].business_unit, department: name, post, job_title: "", reports_to: null });
  };
  for (const name of headed) ensure(name, "hod");
  for (const name of led) ensure(name, "lead");
  return jobs;
}

const shortSkip = new Set(["&", "and", "dan", "+"]);
const shortSmall = new Set(["of", "the", "for", "in", "di"]);
/**
 * A department by its initials, for tight places (Data karyawan's list, the Struktur tags):
 * "Center of Excellence" → "CoE", "Business & Administrative Services" → "BAS", "HR & GA" → "HRGA".
 * One word stays as it is ("Accounting"). A code in brackets wins: "Business Transformation & AI
 * Enablement (CoE)" → "CoE". The full name goes beside it as a title.
 */
export function departmentShort(name: string): string {
  const code = name.match(/\(([^()]{1,12})\)\s*$/)?.[1]?.trim();
  if (code) return code;
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return name.trim();
  return words.filter(word => !shortSkip.has(word.toLowerCase())).map(word => {
    const lower = word.toLowerCase();
    if (shortSmall.has(lower)) return lower[0];
    // An abbreviation already (HR, GA, IT, 3D) stays whole.
    if (word.length <= 3 && word === word.toUpperCase() && /[A-Z0-9]/.test(word)) return word;
    return (word.match(/\p{L}|\p{N}/u)?.[0] ?? "").toUpperCase();
  }).join("");
}

/**
 * Each department's short form among these names; two that would share one ("Bali Office" and
 * "Business Operations" are both "BO") keep their full names, so no short form means two things.
 */
export function departmentShorts(names: Iterable<string>): Map<string, string> {
  const unique = [...new Set([...names].map(name => name.trim()).filter(Boolean))];
  const count = new Map<string, number>();
  for (const name of unique) { const short = departmentShort(name).toUpperCase(); count.set(short, (count.get(short) ?? 0) + 1); }
  return new Map(unique.map(name => { const short = departmentShort(name); return [name, (count.get(short.toUpperCase()) ?? 0) > 1 ? name : short]; }));
}

/** The matching key: the database derives the same one (upper case, single spaces). */
export const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toUpperCase();

/** Words HR's sheet spells wrongly, set right on import. */
const typos: Record<string, string> = { TRANFORMATION: "TRANSFORMATION", BUSIENSS: "BUSINESS", SERVICESS: "SERVICES", MAKRETING: "MARKETING" };
/** Kept in capitals: abbreviations and the company codes. */
const acronyms = new Set(["AI", "HR", "GA", "IT", "3D", "CEO", "CFO", "COO", "CTO", "MD", "PIC", "PR", "BD", "MICE", "WNS", "TEE", "MRP", "UI", "UX"]);
const small = new Set(["of", "and", "the", "for", "in", "dan", "di", "&"]);

/** "HEAD OF BUSINESS TRANFORMATION & AI ENABLEMENT" → "Head of Business Transformation & AI Enablement". */
export function tidy(value: string): string {
  const words = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  return words.map((raw, index) => {
    const word = typos[raw.toUpperCase()] ?? raw;
    const upper = word.toUpperCase();
    if (acronyms.has(upper)) return upper;
    const lower = word.toLowerCase();
    if (index > 0 && small.has(lower)) return lower;
    // Capitalise after a hyphen too (Abdul-Rahman), not after an apostrophe (Ma'ruf).
    return lower.replace(/(^|[-(/])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
  }).join(" ");
}

/** Pantry's category from the job title; anyone else is a karyawan, and the admin can change it. */
export function guessCategory(position: string): EmployeeCategory {
  const title = position.toUpperCase();
  if (/\b(INTERN|MAGANG)\b/.test(title)) return "intern";
  if (/^GENERAL AFFAIRS?$/.test(title.trim())) return "ga";
  return "karyawan";
}

const headers: Record<string, keyof Omit<EmployeeRow, "category">> = {
  EMAIL: "email", "E-MAIL": "email", "EMAIL KANTOR": "email", NIP: "nip", "NOMOR INDUK": "nip",
  "NAMA KARYAWAN": "full_name", "NAMA LENGKAP": "full_name", NAMA: "full_name", "NAMA PANGGILAN": "nickname", PANGGILAN: "nickname",
  DEPARTMENT: "department", DEPARTEMEN: "department", DIVISI: "department", POSITION: "position", JABATAN: "position", OFFICE: "office", KANTOR: "office", PERUSAHAAN: "office",
};

export type ParsedSheet = { sheet: string; rows: EmployeeRow[]; skipped: string[] };

/**
 * People from the workbook: the first sheet with a "Nama karyawan" header row. Rows without a name
 * (titles, totals, blanks) are skipped; a name met twice keeps its first row and is reported.
 */
export function employeesFromSheets(sheets: { name: string; rows: string[][] }[]): ParsedSheet {
  for (const sheet of sheets) {
    const headerAt = sheet.rows.findIndex(row => row.some(cell => headers[cell.trim().toUpperCase()] === "full_name") && row.some(cell => headers[cell.trim().toUpperCase()] === "position" || headers[cell.trim().toUpperCase()] === "department"));
    if (headerAt < 0) continue;
    const map = sheet.rows[headerAt].map(cell => headers[cell.trim().toUpperCase()]);
    const rows: EmployeeRow[] = [];
    const skipped: string[] = [];
    const seen = new Set<string>();
    for (const cells of sheet.rows.slice(headerAt + 1)) {
      const row: Required<Omit<EmployeeRow, "category">> = { full_name: "", nickname: "", department: "", position: "", office: "", email: "", nip: "" };
      map.forEach((key, index) => { if (key && !row[key]) row[key] = (cells[index] ?? "").trim(); });
      if (row.full_name.length < 2) continue;
      const key = nameKey(row.full_name);
      if (seen.has(key)) { skipped.push(`${tidy(row.full_name)} tercantum dua kali; baris kedua dilewati.`); continue; }
      seen.add(key);
      const email = row.email.trim().toLowerCase();
      const nip = row.nip.trim();
      rows.push({
        full_name: tidy(row.full_name), nickname: tidy(row.nickname), department: tidy(row.department), position: tidy(row.position),
        office: row.office.trim().toUpperCase(), category: guessCategory(row.position),
        // A sheet email only fills an empty one later (compareImport), and only when it looks like one.
        ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : {}),
        ...(NIP.test(nip) ? { nip } : {}),
      });
    }
    return { sheet: sheet.name, rows, skipped };
  }
  return { sheet: "", rows: [], skipped: [] };
}

export type ImportChange = "baru" | "berubah" | "sama";
const fields = ["full_name", "nickname", "department", "position", "office"] as const;

/**
 * What an import would do to each person; the category set in the admin is not overwritten, and
 * the sheet's email and NIP only fill empty ones, so what the admin corrected stays.
 */
export function compareImport(rows: EmployeeRow[], current: Employee[]): { row: EmployeeRow; change: ImportChange; changed: string[] }[] {
  const byKey = new Map(current.map(person => [nameKey(person.full_name), person]));
  return rows.map(row => {
    const known = byKey.get(nameKey(row.full_name));
    if (!known) return { row, change: "baru", changed: [] };
    const changed: string[] = fields.filter(field => known[field] !== row[field]);
    if (row.email && !known.email) changed.push("email");
    if (row.nip && !known.nip) changed.push("nip");
    return { row, change: changed.length ? "berubah" : "sama", changed };
  });
}

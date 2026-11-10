import "server-only";
import { leadsFromJobs, primaryFields, reconcileJobs, tidyJob, type Employee, type EmployeeJob, type JobPost } from "@/lib/employees";
import { hasPost, NO_LEADS, type Leads } from "@/lib/pra-wam/leads";
import { ServiceError } from "./config";
import { updateEmployee } from "./employees";
import { databaseError } from "./http";
import { listLeads, setLeads } from "./pra-wam/leads";
import { rolesOf } from "./pra-wam/session";
import { createPrivilegedClient } from "./supabase/admin";

/*
 * Pekerjaan karyawan (9 Nov 2026, migration 202611090003): the jobs a person holds, each in a
 * Business Unit with its department and post (HOD, Lead or a Jabatan). Saving copies the Utama job
 * (the first) to the employees columns and writes pw_leads from the HOD and Lead jobs, so every
 * reader of those (sapaan, Akun, Meeting HOD, the org chart) keeps working unchanged. Before the
 * migration only the Utama job and the HOD/Lead rows are kept.
 */

export const JOBS_MIGRATION = "202611090003_employee_jobs.sql";
/** GM, the team (unit) and a HOD under their GM (10 Nov 2026). */
export const JOBS_GM_MIGRATION = "202611100001_employee_jobs_gm_unit.sql";
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /relation .*employee_jobs/.test(error.message ?? "");
// "unit" on its own, not "business_unit".
const noUnit = (error: { code?: string; message?: string }) => ["42703", "PGRST204"].includes(error.code ?? "") && /(^|[^_a-z])unit\b/i.test(error.message ?? "");
type Row = { employee_id: string; sort_order: number; business_unit: string; department: string; unit?: string | null; post: JobPost; job_title: string | null; reports_to: string | null };
const columns = "employee_id,sort_order,business_unit,department,post,job_title,reports_to";

async function readRows(employeeId?: string): Promise<{ rows: Map<string, EmployeeJob[]>; migrated: boolean; gmReady: boolean }> {
  const read = (fields: string) => {
    let query = createPrivilegedClient().from("employee_jobs").select(fields);
    if (employeeId) query = query.eq("employee_id", employeeId);
    return query.order("employee_id").order("sort_order").limit(5000);
  };
  // The team arrives with migration 202611100001; before it the rows are read without.
  let { data, error } = await read(`${columns},unit`);
  const gmReady = !(error && noUnit(error));
  if (!gmReady) ({ data, error } = await read(columns));
  if (error) { if (missing(error)) return { rows: new Map(), migrated: false, gmReady: false }; databaseError(error); }
  const rows = new Map<string, EmployeeJob[]>();
  for (const row of ((data ?? []) as unknown as Row[]).sort((a, b) => a.sort_order - b.sort_order)) {
    const unit = (row.unit ?? "").trim();
    rows.set(row.employee_id, [...(rows.get(row.employee_id) ?? []), { business_unit: row.business_unit, department: row.department, ...(unit ? { unit } : {}), post: row.post, job_title: row.job_title ?? "", reports_to: row.reports_to ?? null }]);
  }
  return { rows, migrated: true, gmReady };
}

/** A job as the rows before migration 202611100001 hold it: no GM (a HOD), no team, a HOD under nobody. */
const beforeGm = (job: EmployeeJob): EmployeeJob => ({ business_unit: job.business_unit, department: job.department, post: job.post === "gm" ? "hod" : job.post, job_title: job.job_title, reports_to: job.post === "staf" ? job.reports_to : null });
const usesGm = (jobs: EmployeeJob[]) => jobs.some(job => job.post === "gm" || !!job.unit || (job.post === "hod" && !!job.reports_to));

/** pw_leads per person when it is read (it then decides HOD and Lead), else undefined. */
async function leadsByPerson(): Promise<Map<string, Leads> | undefined> {
  const leads = await listLeads().catch(() => null);
  return leads?.migrated ? leads.byPerson : undefined;
}

/** Everyone's jobs for Data karyawan, each agreeing with the employees columns and pw_leads. */
export async function listJobs(people: Employee[]): Promise<{ byPerson: Record<string, EmployeeJob[]>; migrated: boolean; gmReady: boolean }> {
  const [{ rows, migrated, gmReady }, leads] = await Promise.all([readRows(), leadsByPerson()]);
  return { migrated, gmReady, byPerson: Object.fromEntries(people.map(person => [person.id, reconcileJobs(rows.get(person.id) ?? [], person, leads ? leads.get(person.id) ?? NO_LEADS : undefined)])) };
}

/** One person's jobs; the Utama job first. */
export async function jobsOf(person: Employee): Promise<EmployeeJob[]> {
  const [{ rows }, leads] = await Promise.all([readRows(person.id), leadsByPerson()]);
  return reconcileJobs(rows.get(person.id) ?? [], person, leads ? leads.get(person.id) ?? NO_LEADS : undefined);
}

/**
 * Saves a person's jobs, replacing the ones before: the Utama job to employees, every job to
 * employee_jobs (when migrated), and the HOD and Lead jobs to pw_leads (a GM as HOD). A BOD heads
 * nothing. `migrated` is false while employee_jobs waits for its migration (only the Utama job is
 * kept); `gmReady` is false while GM, the team and a HOD under their GM wait for 202611100001 (the
 * jobs are then kept without them: a GM as HOD).
 */
export async function setJobs(employeeId: string, input: EmployeeJob[]): Promise<{ employee: Employee; jobs: EmployeeJob[]; leads: Leads; migrated: boolean; gmReady: boolean }> {
  const jobs = input.map(tidyJob);
  if (!jobs.length) throw new ServiceError(422, "Isi pekerjaan utama.");
  if (jobs.some(job => job.reports_to === employeeId)) throw new ServiceError(422, "Di bawah: pilih orang lain, bukan orangnya sendiri.");
  const leads = leadsFromJobs(jobs);
  // Refused before anything is written, so a BOD is never half saved as HOD or Lead.
  if (hasPost(leads) && (await rolesOf(employeeId)).includes("bod")) throw new ServiceError(422, "BOD tidak bisa menjadi HOD atau Lead.");
  const client = createPrivilegedClient();
  const { data: current, error } = await client.from("employees").select("office").eq("id", employeeId).maybeSingle();
  if (error) databaseError(error);
  if (!current) throw new ServiceError(404, "Karyawan tidak ditemukan.");
  const employee = await updateEmployee(employeeId, primaryFields(jobs, (current.office as string | null) ?? ""));

  const now = new Date().toISOString();
  let migrated = true;
  let gmReady = true;
  let saved = jobs;
  const save = (rows: Record<string, unknown>[]) => client.from("employee_jobs").upsert(rows, { onConflict: "employee_id,sort_order" });
  // Every column, the team included (an emptied team is written as "").
  let { error: saveError } = await save(jobs.map((job, sort_order) => ({ employee_id: employeeId, sort_order, business_unit: job.business_unit, department: job.department, unit: job.unit ?? "", post: job.post, job_title: job.job_title, reports_to: job.reports_to, updated_at: now })));
  // Before 202611100001: no unit column (42703/PGRST204), or its checks refuse a GM or a HOD under
  // someone (23514). Saved again the old way (a GM as HOD, no team), so nothing else is lost.
  if (saveError && (noUnit(saveError) || saveError.code === "23514")) {
    gmReady = !usesGm(jobs);
    saved = jobs.map(beforeGm);
    ({ error: saveError } = await save(saved.map((job, sort_order) => ({ employee_id: employeeId, sort_order, ...job, updated_at: now }))));
  }
  if (saveError) {
    if (!missing(saveError)) databaseError(saveError);
    migrated = false;
  } else {
    const { error: trimError } = await client.from("employee_jobs").delete().eq("employee_id", employeeId).gte("sort_order", jobs.length);
    if (trimError) databaseError(trimError);
  }
  await setLeads(employeeId, leads);
  return { employee, jobs: saved, leads, migrated, gmReady };
}

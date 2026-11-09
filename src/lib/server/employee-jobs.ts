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
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /employee_jobs/.test(error.message ?? "");
type Row = { employee_id: string; sort_order: number; business_unit: string; department: string; post: JobPost; job_title: string | null; reports_to: string | null };

async function readRows(employeeId?: string): Promise<{ rows: Map<string, EmployeeJob[]>; migrated: boolean }> {
  let query = createPrivilegedClient().from("employee_jobs").select("employee_id,sort_order,business_unit,department,post,job_title,reports_to");
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data, error } = await query.order("employee_id").order("sort_order").limit(5000);
  if (error) { if (missing(error)) return { rows: new Map(), migrated: false }; databaseError(error); }
  const rows = new Map<string, EmployeeJob[]>();
  for (const row of ((data ?? []) as Row[]).sort((a, b) => a.sort_order - b.sort_order)) {
    rows.set(row.employee_id, [...(rows.get(row.employee_id) ?? []), { business_unit: row.business_unit, department: row.department, post: row.post, job_title: row.job_title ?? "", reports_to: row.reports_to ?? null }]);
  }
  return { rows, migrated: true };
}

/** pw_leads per person when it is read (it then decides HOD and Lead), else undefined. */
async function leadsByPerson(): Promise<Map<string, Leads> | undefined> {
  const leads = await listLeads().catch(() => null);
  return leads?.migrated ? leads.byPerson : undefined;
}

/** Everyone's jobs for Data karyawan, each agreeing with the employees columns and pw_leads. */
export async function listJobs(people: Employee[]): Promise<{ byPerson: Record<string, EmployeeJob[]>; migrated: boolean }> {
  const [{ rows, migrated }, leads] = await Promise.all([readRows(), leadsByPerson()]);
  return { migrated, byPerson: Object.fromEntries(people.map(person => [person.id, reconcileJobs(rows.get(person.id) ?? [], person, leads ? leads.get(person.id) ?? NO_LEADS : undefined)])) };
}

/** One person's jobs; the Utama job first. */
export async function jobsOf(person: Employee): Promise<EmployeeJob[]> {
  const [{ rows }, leads] = await Promise.all([readRows(person.id), leadsByPerson()]);
  return reconcileJobs(rows.get(person.id) ?? [], person, leads ? leads.get(person.id) ?? NO_LEADS : undefined);
}

/**
 * Saves a person's jobs, replacing the ones before: the Utama job to employees, every job to
 * employee_jobs (when migrated), and the HOD and Lead jobs to pw_leads. A BOD heads nothing.
 * `migrated` is false while employee_jobs waits for its migration (only the Utama job is kept).
 */
export async function setJobs(employeeId: string, input: EmployeeJob[]): Promise<{ employee: Employee; jobs: EmployeeJob[]; leads: Leads; migrated: boolean }> {
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
  const { error: saveError } = await client.from("employee_jobs")
    .upsert(jobs.map((job, sort_order) => ({ employee_id: employeeId, sort_order, ...job, updated_at: now })), { onConflict: "employee_id,sort_order" });
  if (saveError) {
    if (!missing(saveError)) databaseError(saveError);
    migrated = false;
  } else {
    const { error: trimError } = await client.from("employee_jobs").delete().eq("employee_id", employeeId).gte("sort_order", jobs.length);
    if (trimError) databaseError(trimError);
  }
  await setLeads(employeeId, leads);
  return { employee, jobs, leads, migrated };
}

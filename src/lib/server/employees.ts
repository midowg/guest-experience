import "server-only";
import { compareImport, type Employee, type EmployeeRow } from "@/lib/employees";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";

/*
 * Data karyawan, for every Journey app. Server only: the table holds personal data and the
 * service role is the only one that reads it (migration 202611030001_employees.sql).
 */

const MIGRATION = "202611030001_employees.sql";
const columns = "id,full_name,nickname,department,position,office,category,phone,email,active";
const notMigrated = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || /employees/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Data karyawan menunggu migrasi ${MIGRATION}.`);

/** Everyone, active first, by department and name. Empty before the migration. */
export async function listEmployees(activeOnly = false): Promise<{ employees: Employee[]; migrated: boolean }> {
  let query = createPrivilegedClient().from("employees").select(columns);
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query.order("active", { ascending: false }).order("department").order("full_name").limit(2000);
  if (error) { if (notMigrated(error)) return { employees: [], migrated: false }; databaseError(error); }
  return { employees: (data ?? []) as Employee[], migrated: true };
}

/**
 * Saves an import: new names are added, known names get the sheet's name, department, position
 * and office, and the sheet's email when theirs is still empty. What the admin set (category,
 * phone, email, active) stays as it is.
 */
export async function importEmployees(rows: EmployeeRow[]): Promise<{ added: number; updated: number; unchanged: number }> {
  const { employees, migrated } = await listEmployees();
  if (!migrated) throw waiting();
  const plan = compareImport(rows, employees);
  const client = createPrivilegedClient();
  const fresh = plan.filter(item => item.change === "baru").map(item => item.row);
  if (fresh.length) {
    const { error } = await client.from("employees").insert(fresh);
    if (error) databaseError(error);
  }
  const known = new Map(employees.map(person => [person.full_name.trim().replace(/\s+/g, " ").toUpperCase(), person]));
  const now = new Date().toISOString();
  const changed = plan.filter(item => item.change === "berubah");
  for (const { row } of changed) {
    const person = known.get(row.full_name.trim().replace(/\s+/g, " ").toUpperCase());
    if (!person) continue;
    const email = row.email && !person.email ? { email: row.email } : {};
    const { error } = await client.from("employees").update({ full_name: row.full_name, nickname: row.nickname, department: row.department, position: row.position, office: row.office, ...email, updated_at: now }).eq("id", person.id);
    if (error) databaseError(error);
  }
  return { added: fresh.length, updated: changed.length, unchanged: plan.length - fresh.length - changed.length };
}

export async function updateEmployee(id: string, patch: Partial<Omit<Employee, "id">>): Promise<Employee> {
  const { data, error } = await createPrivilegedClient().from("employees").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select(columns).maybeSingle();
  if (error) { if (notMigrated(error)) throw waiting(); databaseError(error); }
  if (!data) throw new ServiceError(404, "Karyawan tidak ditemukan.");
  return data as Employee;
}

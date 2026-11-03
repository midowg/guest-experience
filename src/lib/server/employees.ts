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
const withNip = `${columns},nip`;
const noNipColumn = (error: { code?: string; message?: string }) => ["42703", "PGRST204"].includes(error.code ?? "") && /nip/.test(error.message ?? "");
const tidyRow = (row: Record<string, unknown>) => ({ ...row, nip: (row.nip as string | null | undefined) ?? "" }) as Employee;
const notMigrated = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || /employees/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Data karyawan menunggu migrasi ${MIGRATION}.`);

/** Everyone, active first, by department and name. Empty before the migration; NIP empty before 202611040002. */
export async function listEmployees(activeOnly = false): Promise<{ employees: Employee[]; migrated: boolean; hasNip: boolean }> {
  const read = (fields: string) => {
    let query = createPrivilegedClient().from("employees").select(fields);
    if (activeOnly) query = query.eq("active", true);
    return query.order("active", { ascending: false }).order("department").order("full_name").limit(2000);
  };
  let hasNip = true;
  let { data, error } = await read(withNip);
  if (error && noNipColumn(error)) { hasNip = false; ({ data, error } = await read(columns)); }
  if (error) { if (notMigrated(error)) return { employees: [], migrated: false, hasNip: false }; databaseError(error); }
  return { employees: ((data ?? []) as unknown as Record<string, unknown>[]).map(tidyRow), migrated: true, hasNip };
}

/**
 * Saves an import: new names are added, known names get the sheet's name, department, position
 * and office, and the sheet's email and NIP when theirs are still empty. What the admin set
 * (category, phone, email, NIP, active) stays as it is.
 */
export async function importEmployees(rows: EmployeeRow[]): Promise<{ added: number; updated: number; unchanged: number }> {
  const { employees, migrated, hasNip } = await listEmployees();
  if (!migrated) throw waiting();
  const plan = compareImport(rows, employees);
  const client = createPrivilegedClient();
  // Without the NIP column a sheet's NIP is left out rather than failing the whole import.
  const fresh = plan.filter(item => item.change === "baru").map(({ row }) => { const { nip, ...rest } = row; return hasNip && nip ? { ...rest, nip } : rest; });
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
    const nip = hasNip && row.nip && !person.nip ? { nip: row.nip } : {};
    const { error } = await client.from("employees").update({ full_name: row.full_name, nickname: row.nickname, department: row.department, position: row.position, office: row.office, ...email, ...nip, updated_at: now }).eq("id", person.id);
    if (error) databaseError(error);
  }
  return { added: fresh.length, updated: changed.length, unchanged: plan.length - fresh.length - changed.length };
}

export async function updateEmployee(id: string, patch: Partial<Omit<Employee, "id">>): Promise<Employee> {
  const { nip, ...rest } = patch;
  const values = { ...rest, ...(nip !== undefined ? { nip: nip.trim() || null } : {}), updated_at: new Date().toISOString() };
  const { data, error } = await createPrivilegedClient().from("employees").update(values).eq("id", id).select(nip !== undefined ? withNip : columns).maybeSingle();
  if (error) {
    if (notMigrated(error)) throw waiting();
    if (noNipColumn(error)) throw new ServiceError(503, "NIP menunggu migrasi 202611040002_pra_wam_roles.sql.");
    if (error.code === "23505") throw new ServiceError(409, "NIP ini sudah dipakai karyawan lain.", { nip: ["NIP ini sudah dipakai karyawan lain."] });
    databaseError(error);
  }
  if (!data) throw new ServiceError(404, "Karyawan tidak ditemukan.");
  return tidyRow(data as unknown as Record<string, unknown>);
}

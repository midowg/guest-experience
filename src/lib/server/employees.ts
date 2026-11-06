import "server-only";
import { compareImport, type Employee, type EmployeeRow } from "@/lib/employees";
import { asGender } from "@/lib/pra-wam/call-name";
import { buFromOffice } from "@/lib/pra-wam/leads";
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
const tidyRow = (row: Record<string, unknown>) => ({ ...row, nip: (row.nip as string | null | undefined) ?? "", business_unit: (row.business_unit as string | null | undefined) ?? "", reports_to: (row.reports_to as string | null | undefined) ?? null, gender: asGender(row.gender) }) as Employee;
const noGenderColumn = (error: { code?: string; message?: string }) => ["42703", "PGRST204"].includes(error.code ?? "") && /gender/.test(error.message ?? "");
const noReportsColumn = (error: { code?: string; message?: string }) => ["42703", "PGRST204"].includes(error.code ?? "") && /reports_to/.test(error.message ?? "");
const noBuColumn = (error: { code?: string; message?: string }) => ["42703", "PGRST204"].includes(error.code ?? "") && /business_unit/.test(error.message ?? "");
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
  // The BU arrives with migration 202611060002, Atasan langsung with 202611060006; before them the list is read without.
  // Jenis kelamin arrives with 202611060007.
  let { data, error } = await read(`${withNip},business_unit,reports_to,gender`);
  if (error && noGenderColumn(error)) ({ data, error } = await read(`${withNip},business_unit,reports_to`));
  if (error && noReportsColumn(error)) ({ data, error } = await read(`${withNip},business_unit`));
  if (error && noBuColumn(error)) ({ data, error } = await read(withNip));
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
  // The sheet's office is the BU (WNS, TEE, MRP...): a new person gets it as their Business Unit.
  const fresh = plan.filter(item => item.change === "baru").map(({ row }) => { const { nip, ...rest } = row; const bu = buFromOffice(row.office); return { ...(hasNip && nip ? { ...rest, nip } : rest), ...(bu ? { business_unit: bu } : {}) }; });
  if (fresh.length) {
    let { error } = await client.from("employees").insert(fresh);
    // Before migration 202611060002 there is no BU column: save without it.
    if (error && noBuColumn(error)) ({ error } = await client.from("employees").insert(fresh.map(({ business_unit: _bu, ...rest }) => { void _bu; return rest; })));
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

/** Adds one person by hand (Tambah karyawan). A name already in the list is refused, not doubled. */
export async function createEmployee(input: Omit<Employee, "id">): Promise<Employee> {
  const { nip, reports_to, gender, ...fields } = input;
  // Left out when empty, so adding a person works before migration 202611060007 too.
  const rest = { ...fields, ...(reports_to ? { reports_to } : {}), ...(gender ? { gender } : {}) };
  let { data, error } = await createPrivilegedClient().from("employees").insert({ ...rest, nip: nip.trim() || null }).select("*").single();
  // Before migration 202611060004 / 202611060002 the BU column may be missing: save without it.
  if (error && noBuColumn(error)) {
    const { business_unit: _bu, ...withoutBu } = rest;
    void _bu;
    ({ data, error } = await createPrivilegedClient().from("employees").insert({ ...withoutBu, nip: nip.trim() || null }).select("*").single());
  }
  if (error) {
    if (notMigrated(error)) throw waiting();
    if (error.code === "23505") throw new ServiceError(409, /nip/i.test(error.message) ? "NIP ini sudah dipakai karyawan lain." : "Nama ini sudah ada di Data karyawan.", /nip/i.test(error.message) ? { nip: ["NIP ini sudah dipakai karyawan lain."] } : { full_name: ["Nama ini sudah ada di Data karyawan."] });
    databaseError(error);
  }
  return tidyRow(data as unknown as Record<string, unknown>);
}

/**
 * Removes one person for good. Someone the apps already hold (a WAM account, bookings, sessions,
 * answers) cannot go: the database refuses, and the super admin is told to make them inactive.
 */
export async function deleteEmployee(id: string): Promise<void> {
  const { data, error } = await createPrivilegedClient().from("employees").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") throw new ServiceError(409, "Karyawan ini sudah punya data di aplikasi (akun WAM, booking, atau jawaban), jadi tidak bisa dihapus. Nonaktifkan saja.");
    databaseError(error);
  }
  if (!data?.length) throw new ServiceError(404, "Karyawan tidak ditemukan.");
}

export async function updateEmployee(id: string, patch: Partial<Omit<Employee, "id">>): Promise<Employee> {
  const { nip, ...rest } = patch;
  const values = { ...rest, ...(nip !== undefined ? { nip: nip.trim() || null } : {}), updated_at: new Date().toISOString() };
  const { data, error } = await createPrivilegedClient().from("employees").update(values).eq("id", id).select("*").maybeSingle();
  if (error) {
    if (notMigrated(error)) throw waiting();
    if (noNipColumn(error)) throw new ServiceError(503, "NIP menunggu migrasi 202611040002_pra_wam_roles.sql.");
    if (noBuColumn(error)) throw new ServiceError(503, "BU menunggu migrasi 202611060002_pra_wam_departments_bu.sql.");
    if (noReportsColumn(error)) throw new ServiceError(503, "Atasan langsung menunggu migrasi 202611060006_employees_reports_to.sql.");
    if (noGenderColumn(error)) throw new ServiceError(503, "Jenis kelamin menunggu migrasi 202611060007_employees_gender.sql.");
    if (error.code === "23514" && /gender/.test(error.message)) throw new ServiceError(422, "Pilih Laki-laki atau Perempuan.", { gender: ["Pilih Laki-laki atau Perempuan."] });
    if (error.code === "23514") throw new ServiceError(422, "Atasan langsung tidak boleh orangnya sendiri.", { reports_to: ["Pilih orang lain."] });
    if (error.code === "23505") throw new ServiceError(409, "NIP ini sudah dipakai karyawan lain.", { nip: ["NIP ini sudah dipakai karyawan lain."] });
    databaseError(error);
  }
  if (!data) throw new ServiceError(404, "Karyawan tidak ditemukan.");
  return tidyRow(data as unknown as Record<string, unknown>);
}

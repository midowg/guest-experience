import "server-only";
import type { StaffMember } from "@/lib/types";
import type { StaffInput } from "@/lib/validation";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";

const MIGRATION = "202610210005_staff_members.sql";
const columns = "id,name,role,phone,photo,active,sort_order,employee_id";
const oldColumns = "id,name,role,phone,photo,active,sort_order";
// Before 202611130012 there is no employee_id: read and save without it.
const noEmployeeColumn = (error: { code?: string; message?: string }) => ["42703", "PGRST204"].includes(error.code ?? "") && /employee_id/.test(error.message ?? "");
const notMigrated = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || (/staff_members/.test(error.message ?? "") && !noEmployeeColumn(error));
const withoutEmployee = ({ employee_id: _employee, ...rest }: StaffInput) => { void _employee; return rest; };
const waiting = () => new ServiceError(503, `Daftar tim menunggu migrasi ${MIGRATION}.`);
const linkedTwice = () => new ServiceError(409, "Orang ini sudah terhubung ke anggota tim lain.");

/** The team, in the super admin's order. `activeOnly` for the PIC picker. Empty before the migration. */
export async function listStaff(activeOnly = true): Promise<{ staff: StaffMember[]; migrated: boolean }> {
  const read = (cols: string) => {
    let query = createPrivilegedClient().from("staff_members").select(cols);
    if (activeOnly) query = query.eq("active", true);
    return query.order("sort_order").order("name").limit(500);
  };
  let { data, error } = await read(columns);
  if (error && noEmployeeColumn(error)) ({ data, error } = await read(oldColumns));
  if (error) { if (notMigrated(error)) return { staff: [], migrated: false }; databaseError(error); }
  return { staff: (data ?? []) as unknown as StaffMember[], migrated: true };
}

export async function getStaff(id: string): Promise<StaffMember | null> {
  let { data, error } = await createPrivilegedClient().from("staff_members").select(columns).eq("id", id).maybeSingle();
  if (error && noEmployeeColumn(error)) ({ data, error } = await createPrivilegedClient().from("staff_members").select(oldColumns).eq("id", id).maybeSingle());
  if (error) { if (notMigrated(error)) return null; databaseError(error); }
  return (data as unknown as StaffMember | null) ?? null;
}

export async function createStaff(input: StaffInput): Promise<StaffMember> {
  let { data, error } = await createPrivilegedClient().from("staff_members").insert(input).select(columns).single();
  if (error && noEmployeeColumn(error)) ({ data, error } = await createPrivilegedClient().from("staff_members").insert(withoutEmployee(input)).select(oldColumns).single());
  if (error) { if (error.code === "23505") throw linkedTwice(); if (notMigrated(error)) throw waiting(); databaseError(error); }
  return data as unknown as StaffMember;
}

export async function updateStaff(id: string, input: StaffInput): Promise<StaffMember> {
  const now = new Date().toISOString();
  let { data, error } = await createPrivilegedClient().from("staff_members").update({ ...input, updated_at: now }).eq("id", id).select(columns).maybeSingle();
  if (error && noEmployeeColumn(error)) ({ data, error } = await createPrivilegedClient().from("staff_members").update({ ...withoutEmployee(input), updated_at: now }).eq("id", id).select(oldColumns).maybeSingle());
  if (error) { if (error.code === "23505") throw linkedTwice(); if (notMigrated(error)) throw waiting(); databaseError(error); }
  if (!data) throw new ServiceError(404, "Anggota tim tidak ditemukan.");
  return data as unknown as StaffMember;
}

/** Events keep their copy of the PIC, so removing someone here changes no published page. */
export async function deleteStaff(id: string): Promise<void> {
  const { error } = await createPrivilegedClient().from("staff_members").delete().eq("id", id);
  if (error) { if (notMigrated(error)) throw waiting(); databaseError(error); }
}

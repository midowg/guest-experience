import "server-only";
import type { StaffMember } from "@/lib/types";
import type { StaffInput } from "@/lib/validation";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";

const MIGRATION = "202610210005_staff_members.sql";
const columns = "id,name,role,phone,photo,active,sort_order";
const notMigrated = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205"].includes(error.code ?? "") || /staff_members/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Daftar tim menunggu migrasi ${MIGRATION}.`);

/** The team, in the super admin's order. `activeOnly` for the PIC picker. Empty before the migration. */
export async function listStaff(activeOnly = true): Promise<{ staff: StaffMember[]; migrated: boolean }> {
  let query = createPrivilegedClient().from("staff_members").select(columns);
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query.order("sort_order").order("name").limit(500);
  if (error) { if (notMigrated(error)) return { staff: [], migrated: false }; databaseError(error); }
  return { staff: (data ?? []) as StaffMember[], migrated: true };
}

export async function getStaff(id: string): Promise<StaffMember | null> {
  const { data, error } = await createPrivilegedClient().from("staff_members").select(columns).eq("id", id).maybeSingle();
  if (error) { if (notMigrated(error)) return null; databaseError(error); }
  return (data as StaffMember | null) ?? null;
}

export async function createStaff(input: StaffInput): Promise<StaffMember> {
  const { data, error } = await createPrivilegedClient().from("staff_members").insert(input).select(columns).single();
  if (error) { if (notMigrated(error)) throw waiting(); databaseError(error); }
  return data as StaffMember;
}

export async function updateStaff(id: string, input: StaffInput): Promise<StaffMember> {
  const { data, error } = await createPrivilegedClient().from("staff_members").update({ ...input, updated_at: new Date().toISOString() }).eq("id", id).select(columns).maybeSingle();
  if (error) { if (notMigrated(error)) throw waiting(); databaseError(error); }
  if (!data) throw new ServiceError(404, "Anggota tim tidak ditemukan.");
  return data as StaffMember;
}

/** Events keep their copy of the PIC, so removing someone here changes no published page. */
export async function deleteStaff(id: string): Promise<void> {
  const { error } = await createPrivilegedClient().from("staff_members").delete().eq("id", id);
  if (error) { if (notMigrated(error)) throw waiting(); databaseError(error); }
}

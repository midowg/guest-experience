import "server-only";
import { MAIN_WAM_ADMIN_MIGRATION } from "@/lib/main-wam/admin/labels";
import type { AdminPerson } from "@/lib/main-wam/admin/people";
import { MAIN_WAM_MIGRATION } from "@/lib/main-wam/settings";
import { ServiceError } from "../../config";
import { createPrivilegedClient } from "../../supabase/admin";
import { currentAdmin } from "../../admin-session";
import { mwFail, type DbError } from "../errors";
import { mainWamPeople } from "../people";

/*
 * What every isi acara writer of Admin WAM → Main WAM (agen E) shares: the database refusals said
 * in plain words (fondasi's mwMissing reads any message naming an mw_ table as "not migrated", so
 * the database's own refusals are told apart first), who the admin is, and the people a change may
 * name (active employees only).
 */

export const db = () => createPrivilegedClient();

/** The messages of migration 202611200501's functions. */
const FUNCTION_MESSAGES: Record<string, [number, string]> = {
  MW_GROUP_NOT_FOUND: [404, "Kelompok tidak ditemukan. Muat ulang halaman."],
  MW_SESSION_NOT_FOUND: [404, "Sesi tidak ditemukan. Muat ulang halaman."],
  MW_TRIP_NOT_FOUND: [404, "Langkah perjalanan tidak ditemukan. Muat ulang halaman."],
  MW_COORDINATOR_NOT_MEMBER: [422, "Koordinator harus anggota kelompoknya."],
  MW_DUPLICATE_MEMBER: [409, "Satu orang hanya boleh di satu kelompok."],
  MW_DUPLICATE_GROUP: [409, "Ada nomor kelompok yang tertulis dua kali."],
  MW_BAD_INPUT: [422, "Tidak ada baris yang bisa disimpan."],
};

export type Refusals = { duplicate?: string; inUse?: string; invalid?: string; notFound?: string };

/**
 * A write the database refused, as the admin should read it; a missing table, column or function
 * is "menunggu migrasi" (fondasi's tables: 202611200001; E's functions: 202611200501).
 */
export function adminFail(error: DbError, refusals: Refusals = {}, migration = MAIN_WAM_MIGRATION): never {
  const known = FUNCTION_MESSAGES[error.message ?? ""];
  if (known) throw new ServiceError(known[0], known[1]);
  if (error.code === "P0002") throw new ServiceError(404, refusals.notFound ?? "Data tidak ditemukan. Muat ulang halaman.");
  if (error.code === "23505") throw new ServiceError(409, refusals.duplicate ?? "Data yang sama sudah ada.");
  if (error.code === "23503") throw new ServiceError(409, refusals.inUse ?? "Data ini masih dipakai di bagian lain, atau orangnya tidak ada di Data karyawan.");
  if (error.code === "23514" || error.code === "22P02" || error.code === "22007" || error.code === "23502") throw new ServiceError(422, refusals.invalid ?? "Isian belum sesuai aturan. Periksa lagi lalu simpan.");
  return mwFail(error, migration);
}
/** For writers that call E's functions (migration 202611200501). */
export const rpcFail = (error: DbError, refusals: Refusals = {}): never => {
  // The function itself is missing: E's migration; a table in it: still the fondasi's.
  if (error.code === "42883" || error.code === "PGRST202") return mwFail(error, MAIN_WAM_ADMIN_MIGRATION);
  return adminFail(error, refusals);
};

/** Who changes something: the admin's own employee id when they signed in with their WAM account. */
export async function adminActor(): Promise<{ employeeId: string | null; name: string }> {
  const actor = await currentAdmin();
  if (!actor) return { employeeId: null, name: "Admin" };
  return { employeeId: actor.kind === "person" ? actor.employeeId : null, name: actor.name };
}

/** Active employees by full name (admin views), for pickers, imports and checks. */
export async function adminPeople(): Promise<AdminPerson[]> {
  const people = await mainWamPeople();
  return [...people.values()].filter(person => person.active)
    .map(person => ({ id: person.id, fullName: person.fullName, name: person.name, department: person.department }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "id"));
}

/** Every id is an active employee, or the change is refused. */
export async function assertPeople(ids: readonly (string | null | undefined)[]): Promise<void> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (!wanted.length) return;
  const found = new Set<string>();
  for (let at = 0; at < wanted.length; at += 300) {
    const { data, error } = await db().from("employees").select("id").in("id", wanted.slice(at, at + 300)).eq("active", true);
    if (error) adminFail(error);
    for (const row of data ?? []) found.add(row.id as string);
  }
  const missing = wanted.filter(id => !found.has(id));
  if (missing.length) throw new ServiceError(422, missing.length === 1 ? "Ada satu orang yang tidak ada di Data karyawan atau sudah nonaktif." : `Ada ${missing.length} orang yang tidak ada di Data karyawan atau sudah nonaktif.`);
}

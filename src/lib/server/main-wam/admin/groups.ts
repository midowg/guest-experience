import "server-only";
import type { ActivityImport, ActivityInput, GroupImport, GroupInput, MembersInput } from "@/lib/main-wam/admin/groups";
import { ACTIVITY_GROUP_COLUMNS, activityGroupFromRow, GROUP_COLUMNS, groupFromRow } from "@/lib/main-wam/rows";
import type { MwActivityGroup, MwGroup } from "@/lib/main-wam/types";
import { isSupabaseConfigured, ServiceError } from "../../config";
import { mwMissing, mwWaiting, type Read } from "../errors";
import { adminFail, assertPeople, db, rpcFail } from "./common";

/*
 * Admin WAM → Main WAM → Kelompok (agen E): kelompok and their members (one kelompok per person,
 * one koordinator), and kelompok kegiatan per session (one per person per session). Members are
 * set as a whole through migration 202611200501's functions, in one transaction. Every answer is
 * the whole list again.
 */

export async function adminGroups(): Promise<Read<MwGroup[]>> {
  if (!isSupabaseConfigured()) return { data: [], migrated: false };
  const { data, error } = await db().from("mw_groups").select(GROUP_COLUMNS).order("number").limit(200);
  if (error) { if (mwMissing(error)) return { data: [], migrated: false }; adminFail(error); }
  return { data: (data ?? []).map(row => groupFromRow(row as Record<string, unknown>)), migrated: true };
}
async function groupsOrWait(): Promise<MwGroup[]> {
  const { data, migrated } = await adminGroups();
  if (!migrated) throw mwWaiting();
  return data;
}

const groupRefusals = (number?: number) => ({
  duplicate: number ? `Nomor kelompok ${number} sudah dipakai.` : "Nomor kelompok sudah dipakai.",
  inUse: "Kelompok ini sudah punya foto Momen untuk anggotanya, jadi tidak bisa dihapus. Ganti nama atau anggotanya saja.",
  invalid: "Nomor kelompok 1–99 dan nama 1–40 karakter.",
});

export async function createGroup(input: GroupInput): Promise<{ groups: MwGroup[]; id: string }> {
  const { data, error } = await db().from("mw_groups").insert({ number: input.number, name: input.name, sort: input.number }).select("id").single();
  if (error) adminFail(error, groupRefusals(input.number));
  return { groups: await groupsOrWait(), id: data.id as string };
}

export async function updateGroup(id: string, input: GroupInput): Promise<{ groups: MwGroup[] }> {
  const { data, error } = await db().from("mw_groups").update({ number: input.number, name: input.name, sort: input.number }).eq("id", id).select("id");
  if (error) adminFail(error, groupRefusals(input.number));
  if (!data?.length) throw new ServiceError(404, "Kelompok tidak ditemukan. Muat ulang halaman.");
  return { groups: await groupsOrWait() };
}

export async function deleteGroup(id: string): Promise<{ groups: MwGroup[] }> {
  const { data, error } = await db().from("mw_groups").delete().eq("id", id).select("id");
  if (error) adminFail(error, groupRefusals());
  if (!data?.length) throw new ServiceError(404, "Kelompok tidak ditemukan. Muat ulang halaman.");
  return { groups: await groupsOrWait() };
}

/** Exactly these members (people in another kelompok move here) and this koordinator. */
export async function setGroupMembers(id: string, input: MembersInput): Promise<{ groups: MwGroup[] }> {
  await assertPeople(input.employeeIds);
  const { error } = await db().rpc("mw_admin_set_group_members", { p_group: id, p_members: input.employeeIds, p_coordinator: input.coordinatorId });
  if (error) rpcFail(error);
  return { groups: await groupsOrWait() };
}

/** Kelompok from a sheet: each listed kelompok gets exactly its rows, in one transaction. */
export async function importGroups(input: GroupImport): Promise<{ groups: MwGroup[]; saved: number }> {
  await assertPeople(input.groups.flatMap(group => group.employeeIds));
  const { data, error } = await db().rpc("mw_admin_import_groups", { p_groups: input.groups });
  if (error) rpcFail(error, groupRefusals());
  return { groups: await groupsOrWait(), saved: Number(data ?? input.groups.length) };
}

/* ── Kelompok kegiatan ────────────────────────────────────────────────────────────────────────── */

export async function adminActivityGroups(): Promise<Read<MwActivityGroup[]>> {
  if (!isSupabaseConfigured()) return { data: [], migrated: false };
  const { data, error } = await db().from("mw_activity_groups").select(ACTIVITY_GROUP_COLUMNS).order("sort").order("label").limit(1000);
  if (error) { if (mwMissing(error)) return { data: [], migrated: false }; adminFail(error); }
  return { data: (data ?? []).map(row => activityGroupFromRow(row as Record<string, unknown>)), migrated: true };
}
async function activityOrWait(): Promise<MwActivityGroup[]> {
  const { data, migrated } = await adminActivityGroups();
  if (!migrated) throw mwWaiting();
  return data;
}
const activityRefusals = (label?: string) => ({
  duplicate: label ? `${label} sudah ada di sesi ini.` : "Nama kelompok kegiatan sudah ada di sesi ini.",
  inUse: "Sesi ini sudah tidak ada. Muat ulang halaman.",
  invalid: "Nama 1–40 karakter dan catatan paling panjang 200 karakter.",
});

export async function createActivityGroup(input: ActivityInput, members: readonly string[] = []): Promise<{ groups: MwActivityGroup[]; id: string }> {
  const { data, error } = await db().from("mw_activity_groups").insert({ session_id: input.sessionId, kind: input.kind, label: input.label, note: input.note, sort: input.sort }).select("id").single();
  if (error) adminFail(error, activityRefusals(input.label));
  if (members.length) await setActivityMembers(data.id as string, members);
  return { groups: await activityOrWait(), id: data.id as string };
}

/** The fields, and the members when given (moving people inside the session is allowed). */
export async function updateActivityGroup(id: string, input: ActivityInput, members?: readonly string[]): Promise<{ groups: MwActivityGroup[] }> {
  const { data, error } = await db().from("mw_activity_groups").update({ session_id: input.sessionId, kind: input.kind, label: input.label, note: input.note, sort: input.sort }).eq("id", id).select("id");
  if (error) adminFail(error, activityRefusals(input.label));
  if (!data?.length) throw new ServiceError(404, "Kelompok kegiatan tidak ditemukan. Muat ulang halaman.");
  if (members) await setActivityMembers(id, members);
  return { groups: await activityOrWait() };
}

async function setActivityMembers(id: string, members: readonly string[]): Promise<void> {
  await assertPeople(members);
  const { error } = await db().rpc("mw_admin_set_activity_members", { p_group: id, p_members: members });
  if (error) rpcFail(error, { duplicate: "Satu orang hanya boleh di satu kelompok kegiatan per sesi." });
}

export async function deleteActivityGroup(id: string): Promise<{ groups: MwActivityGroup[] }> {
  const { data, error } = await db().from("mw_activity_groups").delete().eq("id", id).select("id");
  if (error) adminFail(error);
  if (!data?.length) throw new ServiceError(404, "Kelompok kegiatan tidak ditemukan. Muat ulang halaman.");
  return { groups: await activityOrWait() };
}

/** Kelompok kegiatan of one session from a sheet, matched by name, in one transaction. */
export async function importActivityGroups(input: ActivityImport): Promise<{ groups: MwActivityGroup[]; saved: number }> {
  await assertPeople(input.groups.flatMap(group => group.employeeIds));
  const { data, error } = await db().rpc("mw_admin_import_activity_groups", { p_session: input.sessionId, p_groups: input.groups });
  if (error) rpcFail(error, activityRefusals());
  return { groups: await activityOrWait(), saved: Number(data ?? input.groups.length) };
}

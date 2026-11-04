import "server-only";
import { cache } from "react";
import { PLAN_SPOTS } from "@/lib/pra-wam/floor-plan";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";

/*
 * The rooms as the super admin sets them up (migration 202611040009): each room's capacity, the
 * fewest people it is for, whether it can be booked, and its spot on the office floor plan; and
 * one app setting, whether Book shows the floor plan at all. Before the migration the plan shows
 * (the default) and only capacity and bookable can be saved.
 */

export const ROOM_PLAN_MIGRATION = "202611040009_pra_wam_room_plan.sql";
const missing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_app_settings|min_people|plan_key/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Denah dan minimal orang menunggu migrasi ${ROOM_PLAN_MIGRATION}.`);

export type AppSettings = { floorPlan: boolean; migrated: boolean };

async function readSettings(): Promise<AppSettings> {
  const { data, error } = await createPrivilegedClient().from("pw_app_settings").select("floor_plan").eq("id", true).maybeSingle();
  if (error) {
    if (missing(error)) return { floorPlan: true, migrated: false };
    databaseError(error);
  }
  return { floorPlan: data?.floor_plan ?? true, migrated: true };
}
/** Read once per request, however many parts of the page ask. */
export const appSettings = cache(readSettings);

/** Super admin: show the floor plan in Book, or the calendar only. */
export async function setFloorPlan(on: boolean): Promise<AppSettings> {
  const { error } = await createPrivilegedClient().from("pw_app_settings")
    .upsert({ id: true, floor_plan: on, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  return readSettings();
}

export type RoomPatch = { capacity: number | null; minPeople: number | null; bookable: boolean; planKey: string | null };

/** What is wrong with a patch, by field; empty when it can be saved. */
export function roomPatchProblems(patch: RoomPatch): Record<string, string[]> {
  const problems: Record<string, string[]> = {};
  const count = (value: number | null) => value == null || (Number.isInteger(value) && value >= 1 && value <= 500);
  if (!count(patch.capacity)) problems.capacity = ["Kapasitas 1 sampai 500 orang, atau kosongkan."];
  if (!count(patch.minPeople)) problems.minPeople = ["Minimal 1 sampai 500 orang, atau kosongkan."];
  if (!problems.capacity && !problems.minPeople && patch.capacity != null && patch.minPeople != null && patch.minPeople > patch.capacity) {
    problems.minPeople = [`Minimal orang tidak boleh lebih dari kapasitas (${patch.capacity}).`];
  }
  if (patch.planKey != null && !Object.hasOwn(PLAN_SPOTS, patch.planKey)) problems.planKey = ["Pilih spot dari denah."];
  return problems;
}

/**
 * Saves one room. A spot holds one room: when another room has picked it, this is a 409 naming
 * that room, unless `replace`, which takes the spot from it first (that room keeps its other
 * settings and simply has no spot).
 */
export async function saveRoom(id: string, patch: RoomPatch, options: { replace?: boolean } = {}): Promise<void> {
  const problems = roomPatchProblems(patch);
  const first = Object.values(problems)[0];
  if (first) throw new ServiceError(422, first[0], problems);
  const client = createPrivilegedClient();
  if (patch.planKey) {
    const { data: holders, error } = await client.from("pw_rooms").select("id,name").eq("plan_key", patch.planKey).neq("id", id);
    if (error) { if (missing(error)) throw waiting(); databaseError(error); }
    if (holders?.length) {
      if (!options.replace) throw spotTaken(patch.planKey, holders[0].name);
      const { error: freeError } = await client.from("pw_rooms").update({ plan_key: null }).in("id", holders.map(room => room.id));
      if (freeError) databaseError(freeError);
    }
  }
  const { data, error } = await client.from("pw_rooms")
    .update({ capacity: patch.capacity, min_people: patch.minPeople, bookable: patch.bookable, plan_key: patch.planKey })
    .eq("id", id).select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") throw spotTaken(patch.planKey ?? "", null);
    if (error.code === "23514") throw new ServiceError(422, "Minimal orang tidak boleh lebih dari kapasitas.", { minPeople: ["Minimal orang tidak boleh lebih dari kapasitas."] });
    if (!missing(error)) databaseError(error);
    // Before the migration only capacity and bookable exist; anything more must wait for it.
    if (patch.minPeople != null || patch.planKey != null) throw waiting();
    const { data: old, error: oldError } = await client.from("pw_rooms").update({ capacity: patch.capacity, bookable: patch.bookable }).eq("id", id).select("id").maybeSingle();
    if (oldError) databaseError(oldError);
    if (!old) throw new ServiceError(404, "Ruang tidak ditemukan.");
    return;
  }
  if (!data) throw new ServiceError(404, "Ruang tidak ditemukan.");
}

function spotTaken(key: string, holder: string | null) {
  const spot = PLAN_SPOTS[key]?.label ?? "Spot ini";
  const text = holder ? `Spot ${spot} sudah dipakai ${holder}. Lepas dulu dari ${holder}, atau pilih spot lain.` : `Spot ${spot} baru saja dipakai ruang lain. Muat ulang halaman, lalu coba lagi.`;
  return new ServiceError(409, text, { planKey: [text] });
}

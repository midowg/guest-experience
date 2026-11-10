import "server-only";
import { cache } from "react";
import { PLAN_SPOTS, facilitiesProblem, spotTitle } from "@/lib/pra-wam/floor-plan";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";

/*
 * The rooms as the super admin sets them up (migration 202611040009): each room's capacity, the
 * fewest people it is for, its facilities, whether it can be booked, and its spot on the office floor plan; and
 * one app setting, whether Book shows the floor plan at all. Before the migration the plan shows
 * (the default) and only capacity, facilities and bookable can be saved.
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

export type RoomPatch = {
  capacity: number | null; minPeople: number | null; bookable: boolean; planKey: string | null;
  /** Facility tags (TV, Whiteboard…); left as they are when not given. */
  facilities?: string[];
  /** The departments it is kept for (empty = everyone); left as they are when not given. */
  departments?: string[];
};

export const ROOM_DEPARTMENTS_MIGRATION = "202611100001_pw_rooms_departments.sql";

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
  const facilities = patch.facilities && facilitiesProblem(patch.facilities);
  if (facilities) problems.facilities = [facilities];
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
  // pw_rooms.facilities is older than the migration, so it is saved before and after it.
  const facilities = patch.facilities ? { facilities: patch.facilities } : {};
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
    .update({ capacity: patch.capacity, min_people: patch.minPeople, bookable: patch.bookable, plan_key: patch.planKey, ...facilities })
    .eq("id", id).select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") throw spotTaken(patch.planKey ?? "", null);
    if (error.code === "23514") throw new ServiceError(422, "Minimal orang tidak boleh lebih dari kapasitas.", { minPeople: ["Minimal orang tidak boleh lebih dari kapasitas."] });
    if (!missing(error)) databaseError(error);
    // Before the migration only capacity, facilities and bookable exist; anything more must wait for it.
    if (patch.minPeople != null || patch.planKey != null) throw waiting();
    const { data: old, error: oldError } = await client.from("pw_rooms").update({ capacity: patch.capacity, bookable: patch.bookable, ...facilities }).eq("id", id).select("id").maybeSingle();
    if (oldError) databaseError(oldError);
    if (!old) throw new ServiceError(404, "Ruang tidak ditemukan.");
    return;
  }
  if (!data) throw new ServiceError(404, "Ruang tidak ditemukan.");
  if (patch.departments) await saveDepartments(id, patch.departments);
}

/** The departments a room is kept for (10 Nov 2026); before migration 202611100001 only "everyone" can be saved. */
async function saveDepartments(id: string, departments: string[]) {
  const clean = [...new Set(departments.map(name => name.trim()).filter(Boolean))];
  const { error } = await createPrivilegedClient().from("pw_rooms").update({ departments: clean }).eq("id", id);
  if (!error) return;
  if (["42703", "PGRST204"].includes(error.code ?? "") || /departments/.test(error.message ?? "")) {
    if (clean.length) throw new ServiceError(503, `Ruang khusus departemen menunggu migrasi ${ROOM_DEPARTMENTS_MIGRATION}. Isian lain sudah tersimpan.`, { departments: [`Menunggu migrasi ${ROOM_DEPARTMENTS_MIGRATION}.`] });
    return;
  }
  databaseError(error);
}

/** "Ruang 4" → "ruang-4": the room's address-safe key, unique among the rooms. */
export function roomSlug(name: string, taken: readonly string[]): string {
  const base = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 34) || "ruang";
  const padded = base.length < 2 ? `${base}-ruang` : base;
  if (!taken.includes(padded)) return padded;
  for (let n = 2; n < 1000; n++) if (!taken.includes(`${padded}-${n}`)) return `${padded}-${n}`;
  return `${padded}-${Date.now() % 100000}`;
}

/**
 * Any admin (10 Nov 2026): adds a room by its name and kind, at the end of the list. It starts
 * not bookable; capacity, spot, departments and the rest are set in its editor right after.
 */
export async function createRoom(input: { name: string; kind: "utama" | "area" }): Promise<string> {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) throw new ServiceError(422, "Nama ruang 2 sampai 60 karakter.", { name: ["Nama ruang 2 sampai 60 karakter."] });
  const client = createPrivilegedClient();
  const { data: rooms, error } = await client.from("pw_rooms").select("slug,name,sort_order");
  if (error) databaseError(error);
  if ((rooms ?? []).some(room => (room.name as string).trim().toLowerCase() === name.toLowerCase())) {
    throw new ServiceError(409, `Sudah ada ruang bernama ${name}.`, { name: [`Sudah ada ruang bernama ${name}.`] });
  }
  const order = Math.max(0, ...(rooms ?? []).map(room => Number(room.sort_order) || 0)) + 1;
  const { data, error: insertError } = await client.from("pw_rooms")
    .insert({ slug: roomSlug(name, (rooms ?? []).map(room => room.slug as string)), name, kind: input.kind, bookable: false, sort_order: order })
    .select("id").single();
  if (insertError) databaseError(insertError);
  return data.id as string;
}

function spotTaken(key: string, holder: string | null) {
  const spot = PLAN_SPOTS[key] ? spotTitle(key) : "Spot ini";
  const text = holder ? `Spot ${spot} sudah dipakai ${holder}. Lepas dulu dari ${holder}, atau pilih spot lain.` : `Spot ${spot} baru saja dipakai ruang lain. Muat ulang halaman, lalu coba lagi.`;
  return new ServiceError(409, text, { planKey: [text] });
}

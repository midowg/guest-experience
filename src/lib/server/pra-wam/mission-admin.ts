import "server-only";
import { MISSION_SETTING_KEY, personKey } from "@/lib/pra-wam/mission";
import { asMissionSheet, EMPTY_SHEET, type MissionSheet } from "@/lib/pra-wam/mission-sheet";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listPeople } from "./appraisal";

/*
 * Admin Pra WAM → Misi Perjalanan (24 Nov 2026): the room list in pw_settings ('mission_journey').
 * Each save first keeps the list as it was in 'mission_journey_cadangan', and keeps any part of the
 * stored list this page does not edit, so nothing is lost by saving.
 */
export const MISSION_BACKUP_KEY = "mission_journey_cadangan";

const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_settings/.test(error.message ?? "");

export type MissionAdminState = {
  sheet: MissionSheet; migrated: boolean; saved: boolean; updatedAt: string | null;
  /** Names in the list that match no active account: they would not see their room. */
  unmatched: string[];
};

async function readRow(): Promise<{ value: unknown; updated_at: string | null } | null | "missing"> {
  const { data, error } = await createPrivilegedClient().from("pw_settings").select("value,updated_at").eq("key", MISSION_SETTING_KEY).maybeSingle();
  if (error) { if (missing(error)) return "missing"; databaseError(error); }
  return (data as { value: unknown; updated_at: string | null } | null) ?? null;
}

export async function missionAdminState(): Promise<MissionAdminState> {
  const [row, employees] = await Promise.all([readRow(), listPeople().catch(() => [])]);
  if (row === "missing") return { sheet: EMPTY_SHEET, migrated: false, saved: false, updatedAt: null, unmatched: [] };
  const sheet = asMissionSheet(row?.value);
  const known = new Set(employees.filter(person => person.active).flatMap(person => [personKey(person.name), personKey(person.fullName || person.name)]));
  const unmatched = employees.length ? [...sheet.people.map(person => person.name), ...sheet.bod.map(person => person.name)].filter(name => name && !known.has(personKey(name))) : [];
  return { sheet, migrated: true, saved: !!row, updatedAt: row?.updated_at ?? null, unmatched };
}

/** Saves the list (already checked by missionSheetSchema), the old one kept as a backup first. */
export async function saveMissionSheet(sheet: MissionSheet): Promise<void> {
  const row = await readRow();
  if (row === "missing") throw new ServiceError(503, "Misi Perjalanan menunggu tabel pw_settings (migrasi 202611120001).");
  const client = createPrivilegedClient();
  const now = new Date().toISOString();
  const old = row?.value && typeof row.value === "object" ? row.value as Record<string, unknown> : null;
  if (old) {
    const { error } = await client.from("pw_settings").upsert({ key: MISSION_BACKUP_KEY, value: { value: old, savedAt: row?.updated_at ?? now }, updated_at: now }, { onConflict: "key" });
    if (error) databaseError(error);
  }
  // Fields this page does not edit stay as they were, per person by name and at the top.
  const oldPeople = new Map((Array.isArray(old?.people) ? old.people as Record<string, unknown>[] : []).map(person => [personKey(String(person.name ?? "")), person]));
  const oldBod = new Map((Array.isArray(old?.bod) ? old.bod as Record<string, unknown>[] : []).map(person => [personKey(String(person.name ?? "")), person]));
  const value = {
    ...(old ?? {}),
    rooms: sheet.rooms,
    people: sheet.people.map(person => ({ ...(oldPeople.get(personKey(person.name)) ?? {}), ...person })),
    bod: sheet.bod.map(person => {
      const merged: Record<string, unknown> = { ...(oldBod.get(personKey(person.name)) ?? {}), ...person };
      if (!person.ceo) delete merged.ceo;
      return merged;
    }),
  };
  const { error } = await client.from("pw_settings").upsert({ key: MISSION_SETTING_KEY, value, updated_at: now }, { onConflict: "key" });
  if (error) databaseError(error);
}

import "server-only";
import { CARBON_ANSWERS_KEY, CARBON_SETTING_KEY, EMPTY_CARBON_SETUP, asCarbonAnswers, asCarbonSetup, carbonPeopleFrom, type CarbonPerson, type CarbonSetup } from "@/lib/pra-wam/carbon";
import { MISSION_SETTING_KEY, personKey } from "@/lib/pra-wam/mission";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";

/*
 * Jejak karbon in Admin Pra WAM (24 Nov 2026): the panitia's setup and the participants' answers,
 * two rows of pw_settings (migration 202611120001, already there), and the people with their rooms
 * from Misi Perjalanan's sheet. The sheet holds real names, so it stays in the database: the
 * repository is public.
 */

const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_settings/.test(error.message ?? "");

export type CarbonAdminState = { setup: CarbonSetup; people: CarbonPerson[]; saved: boolean; migrated: boolean; updatedAt: string | null };

async function readRows(keys: string[]) {
  const { data, error } = await createPrivilegedClient().from("pw_settings").select("key,value,updated_at").in("key", keys);
  if (error) { if (missing(error)) return null; databaseError(error); }
  return new Map((data ?? []).map(row => [row.key as string, row as { key: string; value: unknown; updated_at: string | null }]));
}

/** Everything the admin page shows. Before pw_settings exists: the empty setup, nothing saved. */
export async function carbonAdminState(): Promise<CarbonAdminState> {
  const rows = await readRows([CARBON_SETTING_KEY, CARBON_ANSWERS_KEY, MISSION_SETTING_KEY]);
  if (!rows) return { setup: EMPTY_CARBON_SETUP, people: [], saved: false, migrated: false, updatedAt: null };
  const setupRow = rows.get(CARBON_SETTING_KEY);
  const sheet = (rows.get(MISSION_SETTING_KEY)?.value ?? null) as Parameters<typeof carbonPeopleFrom>[0];
  return {
    setup: asCarbonSetup(setupRow?.value),
    people: carbonPeopleFrom(sheet, asCarbonAnswers(rows.get(CARBON_ANSWERS_KEY)?.value), personKey),
    saved: !!setupRow, migrated: true, updatedAt: setupRow?.updated_at ?? null,
  };
}

async function write(key: string, value: unknown) {
  const { error } = await createPrivilegedClient().from("pw_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) { if (missing(error)) throw new ServiceError(503, "Jejak karbon menunggu tabel pw_settings (migrasi 202611120001)."); databaseError(error); }
}

/** The panitia's setup, already checked by carbonSetupSchema. */
export const saveCarbonSetup = (setup: CarbonSetup) => write(CARBON_SETTING_KEY, setup);

/** Send someone back to the group trip: their own trip is dropped, their other answers kept. */
export async function sendToGroup(id: string): Promise<void> {
  const rows = await readRows([CARBON_ANSWERS_KEY]);
  const answers = asCarbonAnswers(rows?.get(CARBON_ANSWERS_KEY)?.value);
  if (!answers[id]?.own) throw new ServiceError(404, "Peserta ini sudah ikut rombongan.");
  answers[id] = { ...answers[id], own: null };
  await write(CARBON_ANSWERS_KEY, answers);
}

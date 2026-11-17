import "server-only";
import { cache } from "react";
import { defaultSettings, settingsFromRow, settingsPatch, type SettingsInput, type SettingsRow } from "@/lib/main-wam/settings";
import type { MainWamSettings } from "@/lib/main-wam/types";
import { isSupabaseConfigured, ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listEvents } from "../pra-wam/events";
import { mwFail, mwMissing } from "./errors";

/*
 * Main WAM's settings (mw_settings, one row) and its penguji (mw_testers). Read once per request.
 * Before the migration, without Supabase, or on any failure, everyone gets the defaults (mode pra:
 * Main WAM hidden), so Pra WAM never stops working because of Main WAM.
 */

const COLUMNS = "mode,modules,module_config,theme,event_name,venue,hotel,check_in_at,check_out_at,contacts,groups_published_at,carbon,updated_at";

/** WAM's dates from pw_events (kind wam), the one source Pra WAM's countdown also reads. */
async function wamDates(): Promise<{ startDate: string; endDate: string } | null> {
  try {
    const wam = (await listEvents()).events.find(event => event.kind === "wam");
    return wam ? { startDate: wam.startDate, endDate: wam.endDate } : null;
  } catch { return null; }
}

async function readSettingsUncached(): Promise<MainWamSettings> {
  if (!isSupabaseConfigured()) return defaultSettings();
  const [{ data, error }, dates] = await Promise.all([
    createPrivilegedClient().from("mw_settings").select(COLUMNS).eq("id", true).maybeSingle(),
    wamDates(),
  ]);
  if (error) {
    if (mwMissing(error)) return { ...settingsFromRow(null, dates), migrated: false };
    databaseError(error);
  }
  return settingsFromRow((data ?? null) as SettingsRow | null, dates);
}

/** The settings as saved (throws on a database failure other than a missing migration). */
export const mainWamSettingsState = cache(readSettingsUncached);

/** The settings every page and API decides by: the defaults on any failure. */
export const readMainWamSettings = cache(async (): Promise<MainWamSettings> => {
  try { return await mainWamSettingsState(); } catch { return defaultSettings(); }
});

/** Admin WAM → Main WAM → Pengaturan: mode, modules, module settings, theme colours and font. */
export async function saveMainWamSettings(input: SettingsInput): Promise<MainWamSettings> {
  const current = await readSettingsUncached();
  if (!current.migrated) throw new ServiceError(503, "Pengaturan Main WAM menunggu migrasi 202611200001_main_wam_settings_rundown.sql.");
  if (input.moduleConfig?.survei?.formSlug) {
    const { data } = await createPrivilegedClient().from("cq_forms").select("id").eq("slug", input.moduleConfig.survei.formSlug).maybeSingle();
    if (!data) throw new ServiceError(422, "Kuesioner dengan alamat itu tidak ditemukan.", { formSlug: ["Kuesioner dengan alamat itu tidak ditemukan."] });
  }
  const patch = settingsPatch(current, input);
  if (!Object.keys(patch).length) return current;
  const { error } = await createPrivilegedClient().from("mw_settings").upsert({ id: true, ...patch, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) mwFail(error);
  return readSettingsUncached();
}

/** Writes one jsonb or column of the settings row as it is (the theme images, E's event facts). */
export async function writeSettingsColumns(values: Record<string, unknown>): Promise<MainWamSettings> {
  const { error } = await createPrivilegedClient().from("mw_settings").upsert({ id: true, ...values, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) mwFail(error);
  return readSettingsUncached();
}

/* ── Penguji ──────────────────────────────────────────────────────────────────────────────────── */

export type Tester = { employeeId: string; fullName: string; department: string; addedBy: string; addedAt: string };

/** The people on the penguji list (empty before the migration). */
async function testerIdsUncached(): Promise<Set<string>> {
  if (!isSupabaseConfigured()) return new Set();
  const { data, error } = await createPrivilegedClient().from("mw_testers").select("employee_id").limit(2000);
  if (error) return new Set();
  return new Set((data ?? []).map(row => row.employee_id as string));
}
export const testerIds = cache(testerIdsUncached);

/** Admin WAM: the list with names (full names: admin views), newest first. */
export async function listTesters(): Promise<{ testers: Tester[]; migrated: boolean }> {
  const { data, error } = await createPrivilegedClient().from("mw_testers").select("employee_id,added_by,added_at,employees(full_name,department)").order("added_at", { ascending: false }).limit(2000);
  if (error) { if (mwMissing(error)) return { testers: [], migrated: false }; databaseError(error); }
  return {
    migrated: true,
    testers: (data ?? []).map(row => {
      const person = row.employees as unknown as { full_name: string; department: string } | null;
      return { employeeId: row.employee_id, fullName: person?.full_name ?? "Tanpa nama", department: person?.department ?? "", addedBy: row.added_by, addedAt: row.added_at };
    }),
  };
}

export async function addTester(employeeId: string, addedBy: string): Promise<void> {
  const client = createPrivilegedClient();
  const { data: person } = await client.from("employees").select("id,active").eq("id", employeeId).maybeSingle();
  if (!person?.active) throw new ServiceError(404, "Karyawan tidak ditemukan.");
  const { error } = await client.from("mw_testers").upsert({ employee_id: employeeId, added_by: addedBy.slice(0, 150) }, { onConflict: "employee_id", ignoreDuplicates: true });
  if (error) mwFail(error);
}

export async function removeTester(employeeId: string): Promise<void> {
  const { error } = await createPrivilegedClient().from("mw_testers").delete().eq("employee_id", employeeId);
  if (error) mwFail(error);
}

/** For Pengaturan: active people by full name (an admin view), and the questionnaires a survey may link to. */
export async function settingsPageOptions(): Promise<{ people: { id: string; fullName: string; department: string }[]; forms: { slug: string; name: string }[] }> {
  const client = createPrivilegedClient();
  const [people, forms] = await Promise.all([
    client.from("employees").select("id,full_name,department").eq("active", true).order("full_name").limit(2000),
    client.from("cq_forms").select("slug,name").order("created_at", { ascending: false }).limit(50),
  ]);
  if (people.error) databaseError(people.error);
  return {
    people: (people.data ?? []).map(row => ({ id: row.id, fullName: row.full_name, department: row.department ?? "" })),
    forms: forms.error ? [] : (forms.data ?? []).map(row => ({ slug: row.slug, name: row.name })),
  };
}

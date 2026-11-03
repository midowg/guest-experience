import "server-only";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { notMigrated } from "./session";

/*
 * The events of the one app: Pra WAM (aktif) and WAM (disiapkan), with the modules the admin
 * switches on (migration 202611040003). Before that migration appraisal simply stays open.
 */

export type PraWamEvent = { id: string; slug: string; name: string; kind: "pra_wam" | "wam"; startDate: string; endDate: string; status: "aktif" | "disiapkan" | "selesai"; modules: Record<string, boolean> };
export const moduleLabels: Record<string, string> = { appraisal: "Appraisal: booking ruang" };

export async function listEvents(): Promise<{ events: PraWamEvent[]; migrated: boolean }> {
  const { data, error } = await createPrivilegedClient().from("pw_events").select("id,slug,name,kind,start_date,end_date,status,modules").order("start_date");
  if (error) { if (notMigrated(error)) return { events: [], migrated: false }; databaseError(error); }
  return {
    migrated: true,
    events: (data ?? []).map(row => ({ id: row.id, slug: row.slug, name: row.name, kind: row.kind, startDate: row.start_date, endDate: row.end_date, status: row.status, modules: row.modules ?? {} })),
  };
}

/** Whether people may book appraisal rooms: Pra WAM is active and its appraisal module is on. */
export async function appraisalOpen(): Promise<boolean> {
  const { events, migrated } = await listEvents();
  if (!migrated) return true;
  return events.some(event => event.kind === "pra_wam" && event.status === "aktif" && event.modules.appraisal === true);
}

export async function updateEvent(id: string, patch: { status: PraWamEvent["status"]; modules: Record<string, boolean> }): Promise<void> {
  const { data, error } = await createPrivilegedClient().from("pw_events").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
  if (error) { if (notMigrated(error)) throw new ServiceError(503, "Acara menunggu migrasi 202611040003_pra_wam_events_units.sql."); databaseError(error); }
  if (!data) throw new ServiceError(404, "Acara tidak ditemukan.");
}

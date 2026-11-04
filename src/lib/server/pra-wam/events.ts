import "server-only";
import { cache } from "react";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { notMigrated } from "./session";

/*
 * The events of the one app: Pra WAM (aktif) and WAM (disiapkan), with the modules the admin
 * switches on (migration 202611040003). Before that migration appraisal simply stays open.
 */

export type PraWamEvent = { id: string; slug: string; name: string; kind: "pra_wam" | "wam"; startDate: string; endDate: string; status: "aktif" | "disiapkan" | "selesai"; modules: Record<string, boolean> };
export const moduleLabels: Record<string, string> = { appraisal: "Book: booking ruang" };

async function listEventsUncached(): Promise<{ events: PraWamEvent[]; migrated: boolean }> {
  const { data, error } = await createPrivilegedClient().from("pw_events").select("id,slug,name,kind,start_date,end_date,status,modules").order("start_date");
  if (error) { if (notMigrated(error)) return { events: [], migrated: false }; databaseError(error); }
  return {
    migrated: true,
    events: (data ?? []).map(row => ({ id: row.id, slug: row.slug, name: row.name, kind: row.kind, startDate: row.start_date, endDate: row.end_date, status: row.status, modules: row.modules ?? {} })),
  };
}
/** Read once per request, however many parts of the page ask. */
export const listEvents = cache(listEventsUncached);

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

export type Phase = { kind: "pra_wam" | "wam"; name: string; startDate: string; endDate: string; daysToWam: number | null };

/**
 * Which phase of the one WAM app is running today: the Pra WAM weeks or WAM itself, from the
 * events' dates. Before migration 202611040003 it follows the calendar (Pra WAM to 23 Des 2026).
 */
export async function currentPhase(today: string): Promise<Phase | null> {
  const { events, migrated } = await listEvents();
  const list = migrated ? events : [
    { kind: "pra_wam" as const, name: "Pra WAM", startDate: "2026-10-28", endDate: "2026-12-23", status: "aktif" as const },
    { kind: "wam" as const, name: "WAM 2027", startDate: "2027-01-04", endDate: "2027-01-07", status: "disiapkan" as const },
  ];
  const wam = list.find(event => event.kind === "wam");
  const daysToWam = wam && today < wam.startDate ? Math.round((Date.parse(`${wam.startDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null;
  const now = list.find(event => event.startDate <= today && today <= event.endDate) ?? (wam && today < wam.startDate ? list.find(event => event.kind === "pra_wam") : undefined);
  return now ? { kind: now.kind, name: now.kind === "pra_wam" ? "Pra WAM" : now.name, startDate: now.startDate, endDate: now.endDate, daysToWam } : null;
}

import "server-only";
import { cache } from "react";
import { defaultAbout, type About } from "@/lib/pra-wam/about";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listEvents } from "./events";

/*
 * "Apa itu WAM?" (migration 202611040008): one row the super admin writes. Without the row, or
 * before the migration, everyone sees the default text built from the events' dates.
 */

export const ABOUT_MIGRATION = "202611040008_pra_wam_about.sql";
const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_about/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Apa itu WAM menunggu migrasi ${ABOUT_MIGRATION}.`);

export type AboutState = { about: About; custom: boolean; migrated: boolean; updatedAt: string | null };

async function getAboutUncached(): Promise<AboutState> {
  const [{ events }, { data, error }] = await Promise.all([
    listEvents().catch(() => ({ events: [] })),
    createPrivilegedClient().from("pw_about").select("title,summary,body,points,updated_at").eq("id", true).maybeSingle(),
  ]);
  const fallback = defaultAbout(events);
  if (error) {
    if (missing(error)) return { about: fallback, custom: false, migrated: false, updatedAt: null };
    databaseError(error);
  }
  if (!data) return { about: fallback, custom: false, migrated: true, updatedAt: null };
  return {
    about: { title: data.title, summary: data.summary, body: data.body, points: data.points ?? [] },
    custom: true, migrated: true, updatedAt: data.updated_at,
  };
}
/** Read once per request, however many parts of the page ask. */
export const getAbout = cache(getAboutUncached);

/** Super admin: replace the text (already cleaned and checked by aboutInputSchema). */
export async function saveAbout(about: About): Promise<void> {
  const { error } = await createPrivilegedClient().from("pw_about")
    .upsert({ id: true, ...about, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
}

/** Super admin: drop the written text, so the default shows again. */
export async function resetAbout(): Promise<void> {
  const { error } = await createPrivilegedClient().from("pw_about").delete().eq("id", true);
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
}

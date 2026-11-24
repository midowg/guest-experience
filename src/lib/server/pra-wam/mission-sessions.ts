import "server-only";
import { cache } from "react";
import { z } from "zod";
import { MISSION_SESSION_ID } from "@/lib/pra-wam/mission";
import { ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { missionFor } from "./mission";
import type { Member } from "./session";

/*
 * Which sessions open Misi Perjalanan (Admin Pra WAM → Misi Perjalanan → Sesi, 24 Nov 2026): one row
 * of pw_settings ('misi_sesi'). Until it is saved, the forum it was built for (MISSION_SESSION_ID).
 * For HoD, BoD and test accounts the session's card on Beranda and in Agenda opens it directly.
 */
export const MISSION_SESSIONS_KEY = "misi_sesi";
export const MISSION_SESSIONS_MAX = 5;
export const missionSessionsSchema = z.object({ ids: z.array(z.string().uuid("Sesi tidak dikenal.")).max(MISSION_SESSIONS_MAX, `Paling banyak ${MISSION_SESSIONS_MAX} sesi.`) });

const missing = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code ?? "") || /pw_settings/.test(error.message ?? "");

async function readUncached(): Promise<{ ids: string[]; saved: boolean }> {
  const { data, error } = await createPrivilegedClient().from("pw_settings").select("value").eq("key", MISSION_SESSIONS_KEY).maybeSingle();
  if (error) { if (missing(error)) return { ids: [MISSION_SESSION_ID], saved: false }; databaseError(error); }
  if (!data) return { ids: [MISSION_SESSION_ID], saved: false };
  const parsed = missionSessionsSchema.safeParse((data as { value: unknown }).value);
  return { ids: parsed.success ? [...new Set(parsed.data.ids)] : [MISSION_SESSION_ID], saved: true };
}
const read = cache(readUncached);

/** The sessions that open Misi Perjalanan; the default when it cannot be read (never in the way of a page). */
export const missionSessionIds = async (): Promise<string[]> => (await read().catch(() => ({ ids: [MISSION_SESSION_ID] }))).ids;

export type SessionChoice = { id: string; title: string; startsAt: string | null; status: string };
export type MissionSessionsState = { ids: string[]; saved: boolean; choices: SessionChoice[] };

/** The admin's tab: the chosen sessions and the sessions to pick from (published or draft, newest first). */
export async function missionSessionsState(): Promise<MissionSessionsState> {
  const [{ ids, saved }, sessions] = await Promise.all([readUncached(), createPrivilegedClient().from("pw_sessions").select("id,title,starts_at,status").neq("status", "batal").order("starts_at", { ascending: false, nullsFirst: false }).limit(300)]);
  const choices = sessions.error ? [] : ((sessions.data ?? []) as { id: string; title: string; starts_at: string | null; status: string }[]).map(row => ({ id: row.id, title: row.title, startsAt: row.starts_at, status: row.status }));
  return { ids, saved, choices };
}

export async function saveMissionSessions(ids: string[]): Promise<void> {
  const { error } = await createPrivilegedClient().from("pw_settings").upsert({ key: MISSION_SESSIONS_KEY, value: { ids: [...new Set(ids)] }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) { if (missing(error)) throw new ServiceError(503, "Misi Perjalanan menunggu tabel pw_settings (migrasi 202611120001)."); databaseError(error); }
}

/**
 * Of these sessions, the ones that open Misi Perjalanan for this person (HoD, BoD, CoS, test
 * accounts): their cards link straight to it instead of the detail sheet. Empty for anyone else.
 */
export async function missionSessionsFor(member: Member, sessionIds: (string | null | undefined)[]): Promise<Set<string>> {
  const ids = await missionSessionIds();
  const hit = sessionIds.filter((id): id is string => !!id && ids.includes(id));
  if (!hit.length) return new Set();
  return (await missionFor(member).catch(() => null)) ? new Set(hit) : new Set();
}

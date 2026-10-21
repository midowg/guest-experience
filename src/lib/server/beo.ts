import "server-only";
import { cookies } from "next/headers";
import { DEVICE_COOKIE, isDeviceId, type AdminRole } from "@/lib/admin-token";
import { beoSummary, emptyBeo, type BeoAction, type BeoRevision, type BeoState, type BeoStatus } from "@/lib/beo";
import { createPrivilegedClient } from "./supabase/admin";
import { readAdminEvent } from "./events";
import { listAllRsvps } from "./responses";
import { databaseError } from "./http";
import { ServiceError } from "./config";

const MIGRATION = "202610210001_event_beo.sql";
const notMigrated = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205", "42883", "PGRST202"].includes(error.code ?? "") || /event_beo|apply_beo_action/.test(error.message ?? "");

const toState = (row: Record<string, unknown> | null): BeoState => row ? {
  status: row.status as BeoStatus, prepared_count: (row.prepared_count as number | null) ?? null, notes: (row.notes as string) ?? "",
  version: (row.version as number) ?? 0, locked_at: (row.locked_at as string | null) ?? null, updated_at: (row.updated_at as string | null) ?? null,
} : emptyBeo;

/** The BEO and its revisions, newest first. Before the migration: an empty draft, read only. */
export async function getBeo(eventId: string): Promise<{ state: BeoState; revisions: BeoRevision[]; migrated: boolean }> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("event_beo").select("status,prepared_count,notes,version,locked_at,updated_at").eq("event_id", eventId).maybeSingle();
  if (error) { if (notMigrated(error)) return { state: emptyBeo, revisions: [], migrated: false }; databaseError(error); }
  const history = await client.from("event_beo_revisions").select("id,version,status,prepared_count,attending,reason,device_id,at").eq("event_id", eventId).order("version", { ascending: false }).limit(50);
  if (history.error) databaseError(history.error);
  return { state: toState(data), revisions: (history.data ?? []) as BeoRevision[], migrated: true };
}

export type BeoInput = { action: BeoAction; version: number; prepared_count: number | null; notes?: string; reason?: string };

/** One step of the flow, recorded with this browser's device ID and the attending count now. */
export async function applyBeo(eventId: string, input: BeoInput, attending: number, role: AdminRole): Promise<BeoState> {
  const device = (await cookies()).get(DEVICE_COOKIE)?.value;
  const { data, error } = await createPrivilegedClient().rpc("apply_beo_action", {
    p_event_id: eventId, p_action: input.action, p_expected_version: input.version,
    p_prepared_count: input.prepared_count, p_notes: input.notes ?? null, p_reason: input.reason ?? "",
    p_attending: attending, p_device_id: device && isDeviceId(device) ? device : null, p_role: role,
  });
  if (error) {
    if (notMigrated(error)) throw new ServiceError(503, `BEO menunggu migrasi ${MIGRATION}.`);
    databaseError(error);
  }
  return toState(data as Record<string, unknown>);
}

/** Event, RSVP summary and BEO state together, as the BEO page, print page and PDF need them. */
export async function loadBeo(eventId: string) {
  const event = await readAdminEvent(eventId);
  if (!event) return null;
  const [beo, rsvps] = await Promise.all([getBeo(eventId), listAllRsvps(eventId)]);
  return { event, ...beo, summary: beoSummary(event, rsvps, beo.state.locked_at) };
}

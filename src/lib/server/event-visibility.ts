import "server-only";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";

// Until 202610200005 is applied there is no admin_hidden column: nothing is hidden then.
const notMigrated = (error: { code?: string; message?: string }) =>
  error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST202" || error.code === "42883" || /admin_hidden|set_event_admin_hidden/.test(error.message ?? "");

export async function hiddenEventIds(): Promise<{ ids: Set<string>; migrated: boolean }> {
  const { data, error } = await createPrivilegedClient().from("events").select("id").eq("admin_hidden", true).limit(1000);
  if (error) { if (notMigrated(error)) return { ids: new Set(), migrated: false }; databaseError(error); }
  return { ids: new Set((data ?? []).map(row => row.id as string)), migrated: true };
}

export async function isHiddenFromAdmins(eventId: string): Promise<boolean> {
  const { data, error } = await createPrivilegedClient().from("events").select("admin_hidden").eq("id", eventId).maybeSingle();
  if (error) { if (notMigrated(error)) return false; databaseError(error); }
  return data?.admin_hidden === true;
}

export async function setEventHidden(eventId: string, hidden: boolean): Promise<boolean> {
  const { data, error } = await createPrivilegedClient().rpc("set_event_admin_hidden", { p_id: eventId, p_hidden: hidden });
  if (error) {
    if (notMigrated(error)) throw new ServiceError(503, "Fitur sembunyikan acara menunggu migrasi 202610200005_admin_roles.sql.");
    databaseError(error);
  }
  return data === true;
}

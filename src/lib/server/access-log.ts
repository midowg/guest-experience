import "server-only";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import type { ClientInfo } from "./admin-session";

export type AccessKind = "login_success" | "login_failure" | "logout";
export type AccessEntry = {
  id: number; at: string; kind: AccessKind; ip: string | null; country: string | null; region: string | null;
  city: string | null; user_agent: string | null; device_id: string | null; new_device: boolean;
};

const TABLE = "admin_access_log";
// PostgREST reports a table that has not been migrated yet as PGRST205 (or 42P01 from Postgres).
const missingTable = (error: { code?: string }) => error.code === "PGRST205" || error.code === "42P01";

/** True when this device has signed in successfully before; null when the log is unavailable. */
export async function isKnownDevice(deviceId: string): Promise<boolean | null> {
  try {
    const { data, error } = await createPrivilegedClient().from(TABLE).select("id").eq("device_id", deviceId).eq("kind", "login_success").limit(1);
    return error ? null : data.length > 0;
  } catch { return null; }
}

/**
 * Best effort: a log outage must not lock the owner out, so failures are reported to the
 * server console and to the caller instead of being thrown.
 */
export async function recordAccess(kind: AccessKind, client: ClientInfo, deviceId: string, newDevice: boolean): Promise<boolean> {
  try {
    const { error } = await createPrivilegedClient().from(TABLE).insert({
      kind, ip: client.ip, country: client.country, region: client.region, city: client.city,
      user_agent: client.userAgent, device_id: deviceId, new_device: newDevice,
    });
    if (error) console.error(`admin_access_log: ${missingTable(error) ? "tabel belum dimigrasikan" : error.message}`);
    return !error;
  } catch (error) {
    console.error("admin_access_log: penyimpanan belum tersedia", error instanceof Error ? error.message : "");
    return false;
  }
}

export type AccessFilter = "semua" | "berhasil" | "gagal" | "keluar";
const filterKinds: Record<Exclude<AccessFilter, "semua">, AccessKind> = { berhasil: "login_success", gagal: "login_failure", keluar: "logout" };

export async function listAccessLog(filter: AccessFilter, limit = 200): Promise<{ entries: AccessEntry[]; missing: boolean }> {
  let query = createPrivilegedClient().from(TABLE).select("*").order("at", { ascending: false }).limit(limit);
  if (filter !== "semua") query = query.eq("kind", filterKinds[filter]);
  const { data, error } = await query;
  if (error) {
    if (missingTable(error)) return { entries: [], missing: true };
    databaseError(error);
  }
  return { entries: data as AccessEntry[], missing: false };
}

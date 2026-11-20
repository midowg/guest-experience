import "server-only";
import { cache } from "react";
import { ADMIN_WAM_ACARA_MIGRATION } from "@/lib/admin-access";
import { SEKSI_MAX } from "@/lib/main-wam/staff";
import { isSupabaseConfigured, ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";
import { listEvents } from "../pra-wam/events";
import { mwMissing, mwWaiting, type DbError } from "./errors";

/*
 * Panitia WAM (20 Nov 2026, docs/main-wam/KONTRAK.md §15): the committee of the WAM event, in
 * pw_event_staff (migration 202611200603), kept apart from Pra WAM's committee (the global role in
 * pw_roles, which Pra WAM keeps). Main WAM reads its panitia (tab Panitia, panitia's tools, penguji,
 * "Panitia saja" announcements) from here only. A seksi is a label: every seksi has the same rights.
 * Admin WAM 2026 → Panitia WAM adds and removes people. Before the migration the list is empty (Main
 * WAM then has no panitia, only its listed penguji) and writers answer "menunggu migrasi".
 */

const missing = (error: DbError) => mwMissing(error) || /pw_event_staff/.test(error.message ?? "");

type StaffRow = { employee_id: string; seksi: string | null; granted_at: string; granted_by: string | null; employees?: { full_name: string; department: string | null; active: boolean } | null };

/** The WAM event's committee (id → seksi), one query; empty before the migration; throws on a database failure. */
async function staffUncached(): Promise<Map<string, string>> {
  if (!isSupabaseConfigured()) return new Map();
  const { data, error } = await createPrivilegedClient().from("pw_event_staff").select("employee_id,seksi,pw_events!inner(kind)").eq("pw_events.kind", "wam").limit(2000);
  if (error) { if (missing(error)) return new Map(); databaseError(error); }
  return new Map(((data ?? []) as { employee_id: string; seksi: string | null }[]).map(row => [row.employee_id, row.seksi ?? ""]));
}
/** Panitia WAM (id → seksi), once per request. Throws on a database failure (counts and audiences decide). */
export const wamStaff = cache(staffUncached);

/** Panitia WAM's ids for the gate: on a database failure nobody is panitia (Pra WAM never breaks for Main WAM). */
export const wamStaffIds = cache(async (): Promise<Set<string>> => {
  try { return new Set((await wamStaff()).keys()); } catch { return new Set(); }
});

/* ── Admin WAM 2026 → Panitia WAM ─────────────────────────────────────────────────────────────────── */

export type WamStaffMember = { employeeId: string; fullName: string; department: string; seksi: string; grantedAt: string; grantedBy: string; hasAccount: boolean };
export type WamStaffBoard = { staff: WamStaffMember[]; migrated: boolean; event: { id: string; name: string } | null };

async function wamEvent(): Promise<{ id: string; name: string } | null> {
  const wam = (await listEvents()).events.find(event => event.kind === "wam");
  return wam ? { id: wam.id, name: wam.name } : null;
}

/** The list with full names (an admin view), by seksi then name; who has no active WAM account yet is marked. */
export async function listWamStaff(): Promise<WamStaffBoard> {
  const client = createPrivilegedClient();
  const [event, rows] = await Promise.all([
    wamEvent(),
    client.from("pw_event_staff").select("employee_id,seksi,granted_at,granted_by,employees(full_name,department,active),pw_events!inner(kind)").eq("pw_events.kind", "wam").limit(2000),
  ]);
  if (rows.error) { if (missing(rows.error)) return { staff: [], migrated: false, event }; databaseError(rows.error); }
  const list = (rows.data ?? []) as unknown as StaffRow[];
  const ids = list.map(row => row.employee_id);
  const accounts = ids.length ? await client.from("pw_accounts").select("employee_id").eq("active", true).in("employee_id", ids) : { data: [], error: null };
  const active = new Set(((accounts.data ?? []) as { employee_id: string }[]).map(row => row.employee_id));
  const staff = list.map(row => {
    const person = Array.isArray(row.employees) ? row.employees[0] : row.employees;
    return {
      employeeId: row.employee_id, fullName: person?.full_name ?? "Tanpa nama", department: person?.department ?? "", seksi: row.seksi ?? "",
      grantedAt: row.granted_at, grantedBy: row.granted_by ?? "", hasAccount: active.has(row.employee_id) && person?.active !== false,
    };
  }).sort((a, b) => (a.seksi || "~").localeCompare(b.seksi || "~", "id") || a.fullName.localeCompare(b.fullName, "id"));
  return { staff, migrated: true, event };
}

const cleanSeksi = (seksi: string) => seksi.replace(/\s+/g, " ").trim().slice(0, SEKSI_MAX);

/**
 * Add one person to Panitia WAM, or change their seksi when they are on it already. An active Data
 * karyawan row; never a BOD (BOD approve and read the recap in Main WAM, they are not committee; the
 * same rule as Pra WAM's roles).
 */
export async function saveWamStaff(employeeId: string, seksi: string, by: string, { onlyChange = false } = {}): Promise<"added" | "changed"> {
  const client = createPrivilegedClient();
  const [event, person, bod] = await Promise.all([
    wamEvent(),
    client.from("employees").select("id,active").eq("id", employeeId).maybeSingle(),
    client.from("pw_roles").select("employee_id").eq("employee_id", employeeId).eq("role", "bod").maybeSingle(),
  ]);
  if (!event) throw new ServiceError(409, "Acara WAM belum ada. Siapkan dulu di Admin Pra WAM → Acara dan modul.");
  if (person.error) databaseError(person.error);
  if (!person.data?.active) throw new ServiceError(404, "Karyawan tidak ditemukan.");
  if (bod.error) databaseError(bod.error);
  if (bod.data) throw new ServiceError(422, "BOD tidak bisa menjadi Panitia WAM.");
  const label = cleanSeksi(seksi);
  const found = await client.from("pw_event_staff").select("employee_id").eq("event_id", event.id).eq("employee_id", employeeId).maybeSingle();
  if (found.error) { if (missing(found.error)) throw mwWaiting(ADMIN_WAM_ACARA_MIGRATION); databaseError(found.error); }
  if (found.data) {
    const { error } = await client.from("pw_event_staff").update({ seksi: label }).eq("event_id", event.id).eq("employee_id", employeeId);
    if (error) { if (missing(error)) throw mwWaiting(ADMIN_WAM_ACARA_MIGRATION); databaseError(error); }
    return "changed";
  }
  if (onlyChange) throw new ServiceError(404, "Panitia tidak ditemukan.");
  const { error } = await client.from("pw_event_staff").insert({ event_id: event.id, employee_id: employeeId, seksi: label, granted_by: by.slice(0, 150) });
  if (error) { if (missing(error)) throw mwWaiting(ADMIN_WAM_ACARA_MIGRATION); databaseError(error); }
  return "added";
}

/** Take one person off Panitia WAM (their WAM account and Pra WAM roles stay). */
export async function removeWamStaff(employeeId: string): Promise<void> {
  const event = await wamEvent();
  if (!event) return;
  const { error } = await createPrivilegedClient().from("pw_event_staff").delete().eq("event_id", event.id).eq("employee_id", employeeId);
  if (error) { if (missing(error)) throw mwWaiting(ADMIN_WAM_ACARA_MIGRATION); databaseError(error); }
}

// Once there it stays so; "not yet" is asked again after a minute (Akses admin reads it on every visit).
let migratedSeen = false;
let notYetUntil = 0;
/** Has migration 202611200603 run (pw_event_staff is there)? Until then only the super admin opens Admin WAM 2026. */
export async function wamAcaraMigrated(): Promise<boolean> {
  if (migratedSeen) return true;
  if (Date.now() < notYetUntil || !isSupabaseConfigured()) return false;
  const { error } = await createPrivilegedClient().from("pw_event_staff").select("employee_id", { count: "exact", head: true }).limit(1);
  if (!error) { migratedSeen = true; return true; }
  if (missing(error)) { notYetUntil = Date.now() + 60_000; return false; }
  return false;
}

/*
 * Kuis live's pengendali besides the per-quiz list (20 Nov 2026): whoever holds Admin WAM 2026 (the
 * wam_acara right in admin_grants) on their own WAM account, the app-side twin of that admin right. The
 * super admin's password has no WAM account, so it has no twin here. Pra WAM's admin role and Panitia
 * WAM alone are not enough.
 */
async function holdsWamAcaraUncached(employeeId: string): Promise<boolean> {
  try {
    const { data, error } = await createPrivilegedClient().from("admin_grants").select("apps").eq("employee_id", employeeId).maybeSingle();
    if (error || !data) return false;
    return Array.isArray(data.apps) && (data.apps as string[]).includes("wam_acara");
  } catch { return false; }
}
/** Does this WAM account hold Admin WAM 2026? Once per request; false before the migration or on any failure. */
export const holdsWamAcara = cache(holdsWamAcaraUncached);

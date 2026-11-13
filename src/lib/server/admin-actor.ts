import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { adminAuthConfig, readSession, SESSION_COOKIE } from "@/lib/admin-token";
import { ADMIN_APPS, ADMIN_GRANTS_MIGRATION, mayOpenEvent, tidyGrant, type AdminApp, type AdminGrant, type AdminGrantInput, type EventForAccess } from "@/lib/admin-access";
import { isEmailLike } from "@/lib/pra-wam/login-name";
import { createPrivilegedClient, createPublicClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";
import { loginNameAddress, signInAddress } from "./pra-wam/session";

/*
 * Who is signed in to the admin (13 Nov 2026): the super admin, one person with their grant, or,
 * until migration 202611130012 runs, the shared admin password. Read once per request.
 */

export type AdminActor =
  | { role: "super"; kind: "super"; name: string }
  | { role: "admin"; kind: "shared"; name: string }
  | { role: "admin"; kind: "person"; name: string; employeeId: string; grant: AdminGrant; staffIds: Set<string> };

const missing = (error: { code?: string; message?: string }) =>
  ["PGRST205", "42P01"].includes(error.code ?? "") || /admin_grants/.test(error.message ?? "");
const waiting = () => new ServiceError(503, `Akses admin per orang menunggu migrasi ${ADMIN_GRANTS_MIGRATION}.`);

// Once migrated it stays so; "not yet" is asked again after a minute.
let migratedSeen = false;
let notYetUntil = 0;
/** Has migration 202611130012 run? Until then the shared admin password still works. */
export async function grantsMigrated(): Promise<boolean> {
  if (migratedSeen) return true;
  if (Date.now() < notYetUntil) return false;
  const { error } = await createPrivilegedClient().from("admin_grants").select("employee_id").limit(1);
  if (!error) { migratedSeen = true; return true; }
  if (missing(error)) { notYetUntil = Date.now() + 60_000; return false; }
  databaseError(error);
}

type GrantRow = { employee_id: string; apps: string[] | null; all_events: boolean; event_ids: string[] | null };
const fromRow = (row: GrantRow): AdminGrant => ({
  employeeId: row.employee_id,
  apps: ADMIN_APPS.filter(app => (row.apps ?? []).includes(app)),
  allEvents: row.all_events,
  eventIds: row.event_ids ?? [],
});

/** The Tim Werkudara entries linked to this person (they are the PIC of events that use them). */
async function staffIdsOf(employeeId: string): Promise<Set<string>> {
  const { data, error } = await createPrivilegedClient().from("staff_members").select("id").eq("employee_id", employeeId).limit(20);
  return new Set(error ? [] : (data ?? []).map(row => row.id as string));
}

/** A person as an admin: their account must be active with its own password, and they must have a grant. */
async function personActor(employeeId: string, version: number): Promise<AdminActor | null> {
  const client = createPrivilegedClient();
  const [{ data: account }, { data: grant, error }] = await Promise.all([
    client.from("pw_accounts").select("session_version,active,must_change_password,employees(full_name,active)").eq("employee_id", employeeId).maybeSingle(),
    client.from("admin_grants").select("employee_id,apps,all_events,event_ids").eq("employee_id", employeeId).maybeSingle(),
  ]);
  if (error || !grant || !account?.active || account.must_change_password || account.session_version !== version) return null;
  const person = account.employees as unknown as { full_name: string; active: boolean } | null;
  if (!person?.active) return null;
  return { role: "admin", kind: "person", name: person.full_name, employeeId, grant: fromRow(grant as GrantRow), staffIds: await staffIdsOf(employeeId) };
}

export const currentAdmin = cache(async (): Promise<AdminActor | null> => {
  const config = adminAuthConfig();
  const session = readSession(config, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  if (session.kind === "super") return { role: "super", kind: "super", name: "Super admin" };
  // The shared password ends with the migration: its sessions too.
  if (session.kind === "shared") return (await grantsMigrated()) ? null : { role: "admin", kind: "shared", name: "Admin" };
  return personActor(session.employeeId, session.version).catch(() => null);
});

/** What the access rules need of one event; null when there is no such event. */
export async function eventForAccess(eventId: string): Promise<EventForAccess | null> {
  const client = createPrivilegedClient();
  const [{ data: doc, error }, { data: row }] = await Promise.all([
    client.from("event_documents").select("document").eq("id", eventId).maybeSingle(),
    client.from("events").select("admin_hidden").eq("id", eventId).maybeSingle(),
  ]);
  if (error) databaseError(error);
  if (!doc?.document) return null;
  const document = doc.document as { event_kind?: string; contact?: { staff_id?: string } };
  return { id: eventId, kind: document.event_kind ?? "", hidden: (row as { admin_hidden?: boolean } | null)?.admin_hidden === true, picStaffId: document.contact?.staff_id ?? "" };
}

/** May this actor open the event? The super admin always; the shared password unless hidden. */
export function actorOpensEvent(actor: AdminActor, event: EventForAccess): boolean {
  if (actor.kind === "super") return true;
  if (actor.kind === "shared") return !event.hidden;
  return mayOpenEvent(actor.grant, actor.staffIds, event);
}

/** A personal admin's app, or every app for the super admin and the shared password. */
export function actorHasApp(actor: AdminActor, app: AdminApp): boolean {
  return actor.kind !== "person" || actor.grant.apps.includes(app);
}

/** The events of a list this actor may see. */
export function eventsFor<T extends { id: string; event_kind?: string; contact?: { staff_id?: string } }>(actor: AdminActor, events: T[], hidden: ReadonlySet<string>): T[] {
  return events.filter(event => actorOpensEvent(actor, { id: event.id, kind: event.event_kind ?? "", hidden: hidden.has(event.id), picStaffId: event.contact?.staff_id ?? "" }));
}

/** An event made by a personal admin who does not open every event: picked for them, so they keep it. */
export async function keepEventFor(actor: AdminActor, eventId: string): Promise<void> {
  if (actor.kind !== "person" || actor.grant.allEvents || actor.grant.eventIds.includes(eventId)) return;
  await createPrivilegedClient().from("admin_grants").update({ event_ids: [...actor.grant.eventIds, eventId], updated_at: new Date().toISOString() }).eq("employee_id", actor.employeeId);
}

/* ---- Sign-in with a WAM account ---- */

export type PersonSignIn = { employeeId: string; version: number; name: string };

/**
 * Signs a person in to the admin with their WAM email or nama panggilan and password. 401 when
 * the pair is wrong; 403 when it is right but they are not an admin, or still on the first password.
 */
export async function signInPersonAdmin(identifier: string, password: string): Promise<PersonSignIn> {
  if (!(await grantsMigrated())) throw waiting();
  const wrong = new ServiceError(401, "Email/nama panggilan atau password tidak cocok. Periksa lalu coba lagi.");
  const typed = identifier.trim().toLowerCase();
  const address = isEmailLike(typed) ? (await signInAddress(typed).catch(() => ({ address: typed }))).address : await loginNameAddress(typed).catch(() => null);
  if (!address) throw wrong;
  const { data: auth, error: authError } = await createPublicClient().auth.signInWithPassword({ email: address, password });
  if (authError || !auth.user) throw wrong;
  const client = createPrivilegedClient();
  const { data: account, error } = await client.from("pw_accounts").select("employee_id,session_version,active,must_change_password,employees(full_name,active)").eq("auth_user_id", auth.user.id).maybeSingle();
  if (error) databaseError(error);
  const person = account?.employees as unknown as { full_name: string; active: boolean } | null;
  if (!account?.active || !person?.active) throw wrong;
  if (account.must_change_password) throw new ServiceError(403, "Ganti dulu password awal Anda di aplikasi WAM, lalu masuk lagi di sini dengan password baru.");
  const { data: grant } = await client.from("admin_grants").select("employee_id").eq("employee_id", account.employee_id).maybeSingle();
  if (!grant) throw new ServiceError(403, "Akun ini belum punya akses admin. Minta super admin memberi akses di Super admin → Akses admin.");
  return { employeeId: account.employee_id as string, version: account.session_version as number, name: person.full_name };
}

/* ---- The super admin's list ---- */

export type GrantPerson = { id: string; name: string; department: string; category: string; hasAccount: boolean };
export type GrantEvent = { id: string; title: string; kind: string };

export async function listGrants(): Promise<{ grants: AdminGrant[]; migrated: boolean }> {
  const { data, error } = await createPrivilegedClient().from("admin_grants").select("employee_id,apps,all_events,event_ids").order("created_at").limit(500);
  if (error) { if (missing(error)) return { grants: [], migrated: false }; databaseError(error); }
  return { grants: (data as GrantRow[]).map(fromRow), migrated: true };
}

/** Everyone active in Data karyawan, and whether they have a WAM account (needed to be an admin). */
export async function grantPeople(): Promise<GrantPerson[]> {
  const client = createPrivilegedClient();
  const [{ data: people, error }, { data: accounts }] = await Promise.all([
    client.from("employees").select("id,full_name,department,category,active").eq("active", true).order("full_name").limit(2000),
    client.from("pw_accounts").select("employee_id,active").limit(2000),
  ]);
  if (error) databaseError(error);
  const active = new Set((accounts ?? []).filter(row => row.active).map(row => row.employee_id as string));
  return (people ?? []).map(person => ({ id: person.id as string, name: person.full_name as string, department: (person.department as string) ?? "", category: (person.category as string) ?? "karyawan", hasAccount: active.has(person.id as string) }));
}

export async function saveGrant(employeeId: string, input: AdminGrantInput): Promise<AdminGrant> {
  const client = createPrivilegedClient();
  const { data: account } = await client.from("pw_accounts").select("active").eq("employee_id", employeeId).maybeSingle();
  if (!account?.active) throw new ServiceError(422, "Orang ini belum punya akun WAM yang aktif. Buat akunnya dulu di Admin WAM → Akun dan peran.");
  const grant = tidyGrant(input);
  const { data, error } = await client.from("admin_grants")
    .upsert({ employee_id: employeeId, apps: grant.apps, all_events: grant.allEvents, event_ids: grant.eventIds, updated_at: new Date().toISOString() }, { onConflict: "employee_id" })
    .select("employee_id,apps,all_events,event_ids").single();
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
  return fromRow(data as GrantRow);
}

export async function deleteGrant(employeeId: string): Promise<void> {
  const { error } = await createPrivilegedClient().from("admin_grants").delete().eq("employee_id", employeeId);
  if (error) { if (missing(error)) throw waiting(); databaseError(error); }
}

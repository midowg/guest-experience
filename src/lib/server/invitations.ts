import "server-only";
import { randomBytes } from "node:crypto";
import type { RsvpRecord } from "@/lib/types";
import type { GuestRow } from "@/lib/guest-import";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";

export type EventInvitation = {
  id: string; event_id: string; name: string; token: string; active: boolean; created_at: string; updated_at: string;
  /** International digits (628…), or null. */
  phone: string | null; party_size_max: number;
  last_sent_at: string | null; send_count: number;
  first_opened_at: string | null; last_opened_at: string | null; open_count: number;
  rsvp: RsvpRecord | null;
};
type InvitationRow = Omit<EventInvitation, "rsvp">;
const rsvpFields = "id,event_id,invitation_id,name,organization,attendance,phone,email,has_allergy,allergy_details,created_at,updated_at";
const baseFields = "id,event_id,name,token,active,created_at,updated_at";
const operationFields = `${baseFields},phone,party_size_max,last_sent_at,send_count,first_opened_at,last_opened_at,open_count`;
const operationDefaults = { phone: null, party_size_max: 1, last_sent_at: null, send_count: 0, first_opened_at: null, last_opened_at: null, open_count: 0 };

/** A column or function from 202610200003 that the database does not have yet. */
function notMigrated(error: { code?: string; message?: string }) {
  return error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST202" || error.code === "42883" || /column .* does not exist|Could not find the function/i.test(error.message ?? "");
}
const migrationNeeded = () => new ServiceError(503, "Fitur ini menunggu migrasi 202610200003_guest_operations.sql. Terapkan migrasi itu di Supabase, lalu muat ulang halaman.");

async function withRsvps(eventId: string, invitations: InvitationRow[]): Promise<EventInvitation[]> {
  if (!invitations.length) return [];
  const { data: responses, error } = await createPrivilegedClient().from("rsvps").select(rsvpFields).eq("event_id", eventId).not("invitation_id", "is", null).limit(1000);
  if (error) databaseError(error);
  const byInvitation = new Map((responses ?? []).map(row => [row.invitation_id as string, row as RsvpRecord]));
  return invitations.map(invitation => ({ ...invitation, rsvp: byInvitation.get(invitation.id) ?? null }));
}

/** `migrated: false` means the guest-operations migration is still pending; the list still loads. */
export async function listInvitations(eventId: string): Promise<{ invitations: EventInvitation[]; migrated: boolean }> {
  const client = createPrivilegedClient();
  const query = (fields: string) => client.from("event_invitations").select(fields).eq("event_id", eventId).order("created_at", { ascending: true }).limit(1000);
  const { data, error } = await query(operationFields);
  if (!error) return { invitations: await withRsvps(eventId, (data ?? []) as unknown as InvitationRow[]), migrated: true };
  if (!notMigrated(error)) databaseError(error);
  const legacy = await query(baseFields);
  if (legacy.error) databaseError(legacy.error);
  const rows = ((legacy.data ?? []) as unknown as Omit<InvitationRow, keyof typeof operationDefaults>[]).map(row => ({ ...operationDefaults, ...row }));
  return { invitations: await withRsvps(eventId, rows), migrated: false };
}

type Action = "create" | "rename" | "revoke" | "rotate" | "update";
export async function manageInvitation(eventId: string, action: Action, id?: string, details: { name?: string; phone?: string | null; party_size_max?: number } = {}): Promise<EventInvitation> {
  const extended = action === "update" || details.phone != null || (details.party_size_max ?? 1) !== 1;
  const { data, error } = await createPrivilegedClient().rpc("manage_event_invitation", {
    p_event: eventId, p_id: id ?? null, p_action: action, p_name: details.name ?? null,
    p_token: action === "create" || action === "rotate" ? randomBytes(32).toString("hex") : null,
    // Only send the new parameters when used, so plain actions keep working before the migration.
    ...(extended ? { p_phone: details.phone ?? null, p_party_size: details.party_size_max ?? 1 } : {}),
  });
  if (error) { if (notMigrated(error)) throw migrationNeeded(); databaseError(error); }
  if (!data || typeof data !== "object") throw new ServiceError(503, "Undangan belum dapat dipastikan tersimpan.");
  const [invitation] = await withRsvps(eventId, [{ ...operationDefaults, ...(data as InvitationRow) }]);
  return invitation;
}

export async function importInvitations(eventId: string, rows: GuestRow[]): Promise<EventInvitation[]> {
  const { data, error } = await createPrivilegedClient().rpc("manage_event_invitation", {
    p_event: eventId, p_id: null, p_action: "import",
    p_rows: rows.map(row => ({ name: row.name, phone: row.phone, party_size_max: row.party_size_max, token: randomBytes(32).toString("hex") })),
  });
  if (error) { if (notMigrated(error)) throw migrationNeeded(); databaseError(error); }
  if (!Array.isArray(data)) throw new ServiceError(503, "Impor belum dapat dipastikan tersimpan. Muat ulang daftar sebelum mencoba lagi.");
  return withRsvps(eventId, data as InvitationRow[]);
}

/** Records that the admin opened WhatsApp for these guests; delivery itself is not known. */
export async function markInvitationsSent(eventId: string, ids: string[]): Promise<EventInvitation[]> {
  const { data, error } = await createPrivilegedClient().rpc("manage_event_invitation", { p_event: eventId, p_id: null, p_action: "mark_sent", p_rows: ids });
  if (error) { if (notMigrated(error)) throw migrationNeeded(); databaseError(error); }
  return withRsvps(eventId, (data ?? []) as InvitationRow[]);
}

/** Best effort: a missing migration or a wrong token simply records nothing. */
export async function markInvitationOpened(slug: string, token: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(token)) return;
  const { error } = await createPrivilegedClient().rpc("mark_invitation_opened", { p_slug: slug, p_token: token });
  if (error && !notMigrated(error)) console.error("mark_invitation_opened:", error.message);
}

export async function getPersonalInvitation(slug: string, token: string): Promise<{ name: string; token: string; rsvp: RsvpRecord | null; party_size_max: number } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const client = createPrivilegedClient();
  const { data: event, error: eventError } = await client.from("events").select("id,status,content").eq("slug", slug).maybeSingle();
  if (eventError) databaseError(eventError);
  if (!event || event.status !== "published" || (event.content as { invitation_mode?: string }).invitation_mode !== "personal") return null;
  const find = (fields: string) => client.from("event_invitations").select(fields).eq("event_id", event.id).eq("token", token).eq("active", true).maybeSingle();
  let { data: invitation, error } = await find("id,name,party_size_max");
  if (error && notMigrated(error)) ({ data: invitation, error } = await find("id,name"));
  if (error) databaseError(error);
  if (!invitation) return null;
  const row = invitation as unknown as { id: string; name: string; party_size_max?: number };
  const { data: rsvp, error: rsvpError } = await client.from("rsvps").select(rsvpFields).eq("invitation_id", row.id).maybeSingle();
  if (rsvpError) databaseError(rsvpError);
  return { name: row.name, token, rsvp: (rsvp as RsvpRecord | null) ?? null, party_size_max: row.party_size_max ?? 1 };
}

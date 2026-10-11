import "server-only";
import { randomBytes } from "node:crypto";
import type { RsvpRecord } from "@/lib/types";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";

export type EventInvitation = { id: string; event_id: string; name: string; token: string; active: boolean; created_at: string; updated_at: string; rsvp: RsvpRecord | null };
type InvitationRow = Omit<EventInvitation, "rsvp">;
const rsvpFields = "id,event_id,invitation_id,name,organization,attendance,phone,email,has_allergy,allergy_details,created_at,updated_at";

export async function listInvitations(eventId: string): Promise<EventInvitation[]> {
  const client = createPrivilegedClient();
  const { data, error } = await client.from("event_invitations").select("id,event_id,name,token,active,created_at,updated_at").eq("event_id", eventId).order("created_at", { ascending: true }).limit(1000);
  if (error) databaseError(error);
  const invitations = (data ?? []) as InvitationRow[];
  if (!invitations.length) return [];
  const { data: responses, error: responseError } = await client.from("rsvps").select(rsvpFields).eq("event_id", eventId).not("invitation_id", "is", null).limit(1000);
  if (responseError) databaseError(responseError);
  const byInvitation = new Map((responses ?? []).map(row => [row.invitation_id as string, row as RsvpRecord]));
  return invitations.map(invitation => ({ ...invitation, rsvp: byInvitation.get(invitation.id) ?? null }));
}

export async function manageInvitation(eventId: string, action: "create" | "rename" | "revoke" | "rotate", id?: string, name?: string): Promise<EventInvitation> {
  const { data, error } = await createPrivilegedClient().rpc("manage_event_invitation", {
    p_event: eventId, p_id: id ?? null, p_action: action, p_name: name ?? null,
    p_token: action === "create" || action === "rotate" ? randomBytes(32).toString("hex") : null,
  });
  if (error) databaseError(error);
  if (!data || typeof data !== "object") throw new ServiceError(503, "Undangan belum dapat dipastikan tersimpan.");
  const invitation = data as InvitationRow;
  const { data: rsvp, error: rsvpError } = await createPrivilegedClient().from("rsvps").select(rsvpFields).eq("invitation_id", invitation.id).maybeSingle();
  if (rsvpError) databaseError(rsvpError);
  return { ...invitation, rsvp: (rsvp as RsvpRecord | null) ?? null };
}

export async function getPersonalInvitation(slug: string, token: string): Promise<{ name: string; token: string; rsvp: RsvpRecord | null } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const client = createPrivilegedClient();
  const { data: event, error: eventError } = await client.from("events").select("id,status,content").eq("slug", slug).maybeSingle();
  if (eventError) databaseError(eventError);
  if (!event || event.status !== "published" || (event.content as { invitation_mode?: string }).invitation_mode !== "personal") return null;
  const { data: invitation, error } = await client.from("event_invitations").select("id,name").eq("event_id", event.id).eq("token", token).eq("active", true).maybeSingle();
  if (error) databaseError(error);
  if (!invitation) return null;
  const { data: rsvp, error: rsvpError } = await client.from("rsvps").select(rsvpFields).eq("invitation_id", invitation.id).maybeSingle();
  if (rsvpError) databaseError(rsvpError);
  return { name: invitation.name as string, token, rsvp: (rsvp as RsvpRecord | null) ?? null };
}

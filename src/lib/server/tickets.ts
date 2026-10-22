import "server-only";
import { cookies } from "next/headers";
import { DEVICE_COOKIE, isDeviceId } from "@/lib/admin-token";
import { accessAdminLabels } from "@/lib/rsvp-labels";
import { newTicketCode, type CheckinGuest } from "@/lib/tickets";
import type { RsvpRecord } from "@/lib/types";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";
import { listAllRsvps } from "./responses";

const MIGRATION = "202610210003_tickets_checkin.sql";
const notMigrated = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205", "42883", "PGRST202"].includes(error.code ?? "") || /event_tickets|issue_ticket|check_in_ticket/.test(error.message ?? "");
type TicketRow = { id: string; event_id: string; rsvp_id: string; code: string; checked_in_at: string | null };

/** The ticket of a "yes" answer, made on first ask. Null before the migration. */
export async function ensureTicket(rsvpId: string): Promise<TicketRow | null> {
  const { data, error } = await createPrivilegedClient().rpc("issue_ticket", { p_rsvp_id: rsvpId, p_code: newTicketCode() });
  if (error) { if (notMigrated(error)) return null; databaseError(error); }
  return data as TicketRow;
}

export async function ticketByCode(code: string): Promise<TicketRow | null> {
  const { data, error } = await createPrivilegedClient().from("event_tickets").select("id,event_id,rsvp_id,code,checked_in_at").eq("code", code).maybeSingle();
  if (error) { if (notMigrated(error)) return null; databaseError(error); }
  return data as TicketRow | null;
}

function guestOf(rsvp: RsvpRecord, ticket: TicketRow | undefined): CheckinGuest {
  const allergy = rsvp.has_allergy || rsvp.dietary?.includes("allergy") ? rsvp.allergy_details.trim() || "Alergi (belum dirinci)" : "";
  const access = (rsvp.access ?? []).map(need => need === "other" ? (rsvp.access_other ?? "").trim() : accessAdminLabels[need]).filter(Boolean).join(", ");
  return {
    rsvp_id: rsvp.id, name: rsvp.name, organization: rsvp.organization, party_size: Math.max(1, rsvp.party_size ?? 1),
    allergy, access, ticket_id: ticket?.id ?? null, checked_in_at: ticket?.checked_in_at ?? null,
  };
}

/** Everyone who answered yes, with their check-in state. `migrated` is false before the migration. */
export async function listCheckins(eventId: string): Promise<{ guests: CheckinGuest[]; migrated: boolean }> {
  const rsvps = (await listAllRsvps(eventId)).filter(rsvp => rsvp.attendance === "yes");
  const { data, error } = await createPrivilegedClient().from("event_tickets").select("id,event_id,rsvp_id,code,checked_in_at").eq("event_id", eventId);
  if (error) { if (notMigrated(error)) return { guests: rsvps.map(rsvp => guestOf(rsvp, undefined)), migrated: false }; databaseError(error); }
  const tickets = new Map((data as TicketRow[]).map(ticket => [ticket.rsvp_id, ticket]));
  return { guests: rsvps.map(rsvp => guestOf(rsvp, tickets.get(rsvp.id))).sort((a, b) => a.name.localeCompare(b.name, "id")), migrated: true };
}

/** Check in by ticket code or by RSVP. A repeat scan returns first_time false and the first time. */
export async function checkIn(eventId: string, target: { code?: string; rsvp_id?: string }): Promise<{ guest: CheckinGuest; first_time: boolean }> {
  const device = (await cookies()).get(DEVICE_COOKIE)?.value;
  const { data, error } = await createPrivilegedClient().rpc("check_in_ticket", {
    p_event_id: eventId, p_code: target.code ?? null, p_rsvp_id: target.rsvp_id ?? null, p_device: device && isDeviceId(device) ? device : null,
  });
  if (error) { if (notMigrated(error)) throw new ServiceError(503, `Check-in menunggu migrasi ${MIGRATION}.`); databaseError(error); }
  const ticket = data as TicketRow & { first_time: boolean };
  const rsvp = (await listAllRsvps(eventId)).find(item => item.id === ticket.rsvp_id);
  if (!rsvp) throw new ServiceError(404, "Data tamu tidak ditemukan.");
  return { guest: guestOf(rsvp, ticket), first_time: ticket.first_time };
}

/** For a mistaken check-in: the ticket stays, only the check-in is cleared. */
export async function undoCheckIn(eventId: string, ticketId: string): Promise<void> {
  const { error } = await createPrivilegedClient().from("event_tickets").update({ checked_in_at: null, checked_in_device: null }).eq("event_id", eventId).eq("id", ticketId);
  if (error) { if (notMigrated(error)) throw new ServiceError(503, `Check-in menunggu migrasi ${MIGRATION}.`); databaseError(error); }
}

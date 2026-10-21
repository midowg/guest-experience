import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { InvitationManager } from "@/components/admin/InvitationManager";
import { PublicLinkCard } from "@/components/admin/PublicLinkCard";
import { createSeedEvent } from "@/lib/seed-event";
import type { EventInvitation } from "@/lib/server/invitations";

export const dynamic = "force-dynamic";

/** Layout check for the guest list with sample guests. Actions are refused without a session. */
export default function DevInvitationsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const event = { ...createSeedEvent(), invitation_mode: "personal" as const };
  const now = new Date().toISOString();
  const guest = (n: number, name: string, over: Partial<EventInvitation> = {}): EventInvitation => ({
    id: `7a1d0000-0000-4000-8000-00000000000${n}`, event_id: event.id, name, token: String(n).repeat(64), active: true, created_at: now, updated_at: now,
    phone: null, party_size_max: 1, last_sent_at: null, send_count: 0, first_opened_at: null, last_opened_at: null, open_count: 0, rsvp: null, ...over,
  });
  const answer = (attendance: "yes" | "no") => ({ id: crypto.randomUUID(), event_id: event.id, name: "", organization: "", attendance, phone: "", email: "", has_allergy: false, allergy_details: "", created_at: now });
  const guests = [
    guest(1, "Contoh Tamu Satu", { phone: "6281200000001", party_size_max: 2 }),
    guest(2, "Contoh Tamu Dua", { phone: "6281200000002", last_sent_at: now, send_count: 1, first_opened_at: now, last_opened_at: now, open_count: 2, rsvp: answer("yes") }),
    guest(3, "Contoh Tamu Tiga", { last_sent_at: now, send_count: 2, first_opened_at: now, last_opened_at: now, open_count: 1 }),
    guest(4, "Contoh Tamu Empat", { phone: "6281200000004", last_sent_at: now, send_count: 1, rsvp: answer("no") }),
    guest(5, "Contoh Tamu Lima", { active: false }),
  ];
  return <AdminShell bare><h1>Undangan tamu (contoh)</h1><PublicLinkCard event={event} origin="https://invitation.werkudara.group" /><InvitationManager event={event} initial={guests} migrated /></AdminShell>;
}

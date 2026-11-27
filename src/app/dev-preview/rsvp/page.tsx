import { notFound } from "next/navigation";
import { AdminShell, EventNavigation } from "@/components/admin/shared/AdminShell";
import { ResponsesView } from "@/components/admin/responses/ResponseViews";
import { createSeedEvent } from "@/lib/seed-event";
import type { RsvpRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Layout check for RSVP with sample answers (contoh only). Filters and export need a session. */
export default function DevRsvpPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const event = { ...createSeedEvent(), status: "published" as const };
  const now = new Date().toISOString();
  const row = (n: number, over: Partial<RsvpRecord>): RsvpRecord => ({ id: `5b1d0000-0000-4000-8000-00000000000${n}`, event_id: event.id, name: `Contoh Tamu ${n}`, organization: "", attendance: "yes", phone: "", email: "", has_allergy: false, allergy_details: "", created_at: now, ...over } as RsvpRecord);
  const items = [
    row(1, { organization: "PT Contoh Nusantara", phone: "0812 0000 0001", whatsapp_consent: true, invitation_id: "x" } as Partial<RsvpRecord>),
    row(2, { organization: "CV Contoh Mandiri", attendance: "no", email: "contoh@example.com" }),
    row(3, { has_allergy: true, allergy_details: "Kacang", phone: "0812 0000 0003" }),
  ];
  return <AdminShell><EventNavigation event={event} current="responses" /><ResponsesView eventId={event.id} initial={{ items, total: 3, page: 1, pageSize: 50 }} initialFilters={{ attendance: "", q: "" }} /></AdminShell>;
}

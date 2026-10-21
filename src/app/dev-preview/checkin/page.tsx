import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { CheckinBoard } from "@/components/admin/CheckinBoard";
import { createSeedEvent } from "@/lib/seed-event";
import type { CheckinGuest } from "@/lib/tickets";

export const dynamic = "force-dynamic";

/** Layout check for door check-in with sample guests. Check-in is refused without a session. */
export default function DevCheckinPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const event = createSeedEvent();
  const guest = (n: number, name: string, over: Partial<CheckinGuest> = {}): CheckinGuest => ({
    rsvp_id: `5a000000-0000-4000-8000-00000000000${n}`, name, organization: "Contoh Instansi", party_size: 1, allergy: "", access: "", ticket_id: null, checked_in_at: null, ...over,
  });
  const guests = [
    guest(1, "Contoh Tamu Satu", { party_size: 2, allergy: "Kacang" }),
    guest(2, "Contoh Tamu Dua", { access: "Kursi roda" }),
    guest(3, "Contoh Tamu Tiga", { ticket_id: "6a000000-0000-4000-8000-000000000003", checked_in_at: new Date().toISOString() }),
    guest(4, "Contoh Tamu Empat"),
  ];
  return <AdminShell bare><h1>Check-in (contoh)</h1><CheckinBoard event={event} initial={guests} migrated /></AdminShell>;
}

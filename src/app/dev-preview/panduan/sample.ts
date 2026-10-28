import { buildEventFromSetup } from "@/lib/event-setup";
import type { EventRecord } from "@/lib/types";

/** A Panduan lokasi exactly as "Buat acara" makes it, with a made-up host (never a real number). */
export function samplePlaceGuide(): EventRecord {
  let n = 0;
  const uuid = () => `7a000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const event = buildEventFromSetup({
    template: "panduan-lokasi", title: "Your Visit to Werkudara", starts_at: "2026-11-02T02:00:00.000Z", ends_at: null, timezone: "Asia/Jakarta",
    audience: "external", language: "id", invitation_mode: "open", location: "later", venue_name: "", address: "", location_url: "",
    greeting: "", introduction: "", closing: "", modules: ["location", "contact"], guest_estimate: null, rsvp_closes_at: null,
    contact_name: "Contoh Raka", contact_phone: "0812 0000 0001", pic_staff_id: "",
  }, { id: "7a000000-0000-4000-8000-000000000000", uuid, now: "2026-10-28T00:00:00.000Z" });
  return { ...event, code: "PL23CD", contact: { ...event.contact, channel: "whatsapp" } };
}

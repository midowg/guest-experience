import { notFound } from "next/navigation";
import { EventExperience } from "@/components/guest/EventExperience";
import { buildEventFromSetup, type EventSetup } from "@/lib/event-setup";
import type { EventPhase } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * A Welcome visit as its guests see it, built the way "Buat acara" builds one, for checking the
 * guest page against board 11 in docs/journey-platform.pen. ?fase=day|after shows the other phases; ?panjang=1 a long name and opening line, as real visits have.
 */
export default async function DevWelcomePage({ searchParams }: { searchParams: Promise<{ fase?: string; panjang?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { fase, panjang } = await searchParams;
  const long = panjang === "1";
  let n = 0;
  const setup: EventSetup = {
    template: "kunjungan-klien", title: long ? "Presentasi & Training Website Contoh bersama PT Contoh Buana Edumedia" : "Kunjungan PT Contoh Nusantara", starts_at: "2026-11-12T03:00:00.000Z", ends_at: "2026-11-12T06:00:00.000Z",
    timezone: "Asia/Jakarta", audience: "external", language: "id_en", invitation_mode: "open", location: "werkudara",
    venue_name: "Kantor Werkudara", address: "Jl. Bhinneka No. 09, Condong Catur, Sleman", location_url: "https://maps.app.goo.gl/contoh",
    greeting: "Selamat datang di Werkudara", introduction: "Kami ingin memperkenalkan cara kerja Werkudara secara langsung dan menjajaki kerja sama untuk acara tahunan Anda.", closing: "",
    modules: ["about", "agenda", "location", "team", "rsvp", "contact", "feedback"], guest_estimate: 4, rsvp_closes_at: long ? "2026-11-11T10:00:00.000Z" : null,
    contact_name: "Contoh Dewi", contact_phone: "0812 0000 0001", pic_staff_id: "",
  };
  const event = { ...buildEventFromSetup(setup, { id: "5e7a0c1e-0000-4000-8000-000000000001", now: "2026-10-20T03:00:00.000Z", uuid: () => `5e7a0c1e-0000-4000-8000-${String(++n).padStart(12, "0")}` }), code: "AB23CD", slug: "contoh", status: "published" as const };
  if (long) event.subtitle = "Terima kasih sudah meluangkan waktu untuk mempresentasikan dan melatih tim kami menggunakan website. Semua yang perlu Anda tahu sebelum datang ada di halaman ini.";
  const phase: EventPhase = fase === "day" || fase === "after" ? fase : "before";
  return <EventExperience event={event} phase={phase} preview previewNotice={false} />;
}

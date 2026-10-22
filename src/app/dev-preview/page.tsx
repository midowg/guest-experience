import { notFound } from "next/navigation";
import { EventExperience } from "@/components/guest/EventExperience";
import { createSeedEvent } from "@/lib/seed-event";
import type { EventRecord, HeroTextPosition, ThemeKey } from "@/lib/types";
import { isPhase } from "@/lib/event-phase";
import { themeKeys } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Placeholder photography, for layout checking only — never shipped as event content. */
const sampleGallery = [1, 2, 3].map((n, index) => ({
  id: `aaaaaaaa-0000-4000-8000-00000000000${n}`,
  url: `https://picsum.photos/seed/werkudara${n}/1600/1000`,
  alt: "",
  caption: index === 0 ? "Contoh keterangan foto" : "",
  sort_order: index,
  srcset: [],
}));

const POSITIONS = new Set<HeroTextPosition>(["left", "center"]);
const MAP_EMBED_URL = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2350.7163428830067!2d110.40227360184343!3d-7.745421472090749!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e7a575cc5c60b55%3A0x857e128884471468!2sWerkudara%20Group!5e0!3m2!1sid!2sid!4v1791620156842!5m2!1sid!2sid";

/**
 * Development-only rendering check for the guest layout. Never reachable in a production
 * build, and never a stand-in for a real published event.
 *
 * ?photos=0..3 gallery size · ?hero=0 text-only opening · ?pos=left|center text placement
 * ?venue=0 drop the separate venue photo · ?preview=0 hide the admin banner · ?map=0 show the manual location
 * ?fase=before|day|after journey phase · ?tema=werkudara|nenek|gala|khidmat|segar · ?audiens=internal · ?sudut=soft
 */
export default async function DevPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const read = (key: string) => { const value = params[key]; return (Array.isArray(value) ? value[0] : value) ?? ""; };
  const count = Math.max(0, Math.min(3, Number(read("photos") || 3) || 0));
  const position = POSITIONS.has(read("pos") as HeroTextPosition) ? read("pos") as HeroTextPosition : "left";
  const hero = read("hero") === "0"
    ? { url: "", alt: "", srcset: [], focus: "center" as const, text_position: position }
    : {
      url: "https://picsum.photos/seed/werkudara-hero/2400/1500",
      alt: "",
      srcset: [],
      focus: "center" as const,
      text_position: position,
    };
  // The venue photo and the gallery must appear together; ?venue=0 checks the gallery alone.
  const venue = read("venue") === "0"
    ? { venue_image_url: "", venue_image_alt: "", venue_image_credit: "" }
    : { venue_image_url: "https://picsum.photos/seed/werkudara-venue/1600/1000", venue_image_alt: "", venue_image_credit: "Contoh kredit foto" };
  const phase = isPhase(read("fase")) ? read("fase") as "before" | "day" | "after" : "before";
  const theme = (themeKeys as readonly string[]).includes(read("tema")) ? read("tema") as ThemeKey : "werkudara";
  const base = createSeedEvent();
  // On the day, the sample schedule is moved to today so the "now" marker has something to mark.
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(new Date());
  const shift = (value: string) => value.replace(/^\d{4}-\d{2}-\d{2}/, today);
  // ?program=1: a two-day trip with activity details and an emergency card.
  const program = read("program") === "1";
  const tripDay = (offset: number, time: string) => new Date(Date.parse(`${today}T${time}:00+07:00`) + offset * 86400000).toISOString();
  const tripAgenda = [
    { id: "7d000000-0000-4000-8000-000000000001", starts_at: tripDay(0, "08:00"), ends_at: tripDay(0, "09:30"), title: "Contoh: penjemputan di bandara", description: "", sort_order: 0 },
    { id: "7d000000-0000-4000-8000-000000000002", starts_at: tripDay(0, "15:00"), ends_at: tripDay(0, "17:00"), title: "Contoh: pantai berpasir merica", description: "Contoh keterangan kegiatan.", sort_order: 1 },
    { id: "7d000000-0000-4000-8000-000000000003", starts_at: tripDay(1, "09:00"), ends_at: tripDay(1, "12:00"), title: "Contoh: desa adat", description: "", sort_order: 2 },
  ];
  const agenda = program ? tripAgenda : phase === "day" ? base.agenda.map(item => ({ ...item, starts_at: shift(item.starts_at), ends_at: shift(item.ends_at) })) : base.agenda;
  const sample = (seed: string, alt: string) => ({ url: `https://picsum.photos/seed/${seed}/1600/1000`, alt, srcset: [] });
  const journey: Partial<EventRecord> = {
    event_kind: "kunjungan", audience: read("audiens") === "internal" ? "internal" : "external",
    theme: { key: theme, corners: read("sudut") === "soft" ? "soft" : "square" },
    experience: { title: "", story: "Kunjungan ini kami rancang seperti menyambut kerabat: santai, hangat, dan penuh percakapan.", image: sample("werkudara-pendopo", "Contoh foto pendopo"), moments: [
      { icon: "coffee", title: "Sambutan di pendopo", description: "Contoh keterangan momen" },
      { icon: "utensils", title: "Makan siang bersama", description: "Menu menyesuaikan kebutuhan Anda" },
      { icon: "gift", title: "Satu kejutan kecil", description: "Kami simpan sampai hari H" },
    ] },
    route: { map_image: sample("werkudara-map", "Contoh peta rute"), steps: [
      { title: "Lewat jalan utama", description: "Contoh petunjuk langkah pertama.", image: { url: "", alt: "", srcset: [] } },
      { title: "Belok di titik ini", description: "Perhatikan titik belok seperti di foto.", image: sample("werkudara-turn", "Contoh foto titik belok") },
    ] },
    contact: { ...base.contact, name: "Koordinator Acara", phone: "0812 3456 7890", role: "Hospitality", channel: "whatsapp" },
    day_note: "Contoh catatan hari H: Wi-Fi tamu tersedia, tanyakan ke resepsionis.",
    after: { title: "", message: "Contoh pesan terima kasih untuk tamu.", image: sample("werkudara-after", "Contoh foto penutup"), collaboration: { enabled: true, title: "", description: "Tertarik berkolaborasi? Tim kami senang mendengar ide Anda.", button_label: "" } },
    ...(program ? {
      event_kind: "program" as const,
      agenda_details: { "7d000000-0000-4000-8000-000000000002": { teaser: "kenapa pasirnya seperti merica?", did_you_know: "Contoh isi kotak Tahukah Anda.", more_story: "Contoh cerita lengkap.", place: "Contoh lokasi kegiatan", pdf_page: 4 } },
      presentation_pdf_url: "https://example.com/contoh.pdf",
      emergency: { name: "Contoh tim medis", phone: "0812 0000 0000", hospital: "Contoh rumah sakit terdekat", hospital_address: "Contoh alamat rumah sakit", hospital_maps_url: "https://example.com/peta" },
    } : {}),
    prepare: { title: "", intro: "Contoh pengantar persiapan tamu.", items: [
      { icon: "shirt", title: "Dress code", description: "Contoh: batik atau kemeja berkerah.", list: [] },
      { icon: "backpack", title: "Yang perlu dibawa", description: "", list: ["Kartu identitas", "Botol minum"] },
      { icon: "gift", title: "Yang kami siapkan untuk Anda", description: "", list: ["Kaos acara", "Topi"] },
    ] },
    review_enabled: true, review_url: "https://example.com/ulasan",
    // ?bahasa=id_en shows the ID/EN switch; ?bahasa=en opens in English.
    language: read("bahasa") === "en" ? "en" : read("bahasa") === "id_en" ? "id_en" : "id",
    translations: { en: { ...base.translations.en, title: "Core Committee Meeting", subtitle: "Sample English subtitle" } },
    sections: base.sections.map(section => ({ ...section, enabled: section.key !== "feedback" })),
  };
  return <EventExperience
    event={{ ...base, ...journey, agenda, status: "published", hero, ...venue, gallery: sampleGallery.slice(0, count), location_display: read("map") === "0" ? "manual" : "embed", location_embed_url: MAP_EMBED_URL }}
    preview={read("preview") !== "0"}
    phase={phase}
  />;
}

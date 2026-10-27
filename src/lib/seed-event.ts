import { emptyGuide } from "./guide";
import { emptyDonation } from "./donations";
import type { EventRecord } from "./types";
import { emptyPoster } from "./poster";

export function createSeedEvent(): EventRecord {
  return {
    id: "10f3a511-2331-4000-8000-000000000001", slug: "rapat-panitia-nyepi-1949", status: "draft",
    title: "Rapat Panitia Inti dan Koordinator", subtitle: "Hari Suci Nyepi Tahun Saka 1949 D.I. Yogyakarta",
    organizer: "Panitia Hari Suci Nyepi Tahun Saka 1949 D.I. Yogyakarta", greeting: "Om Swastyastu",
    introduction: "Dengan hormat, kami mengundang Bapak/Ibu/Saudara untuk hadir dalam Rapat Panitia Inti dan Koordinator. Pertemuan ini menjadi ruang bersama untuk membahas dan menyusun Buku Grand Design Launching Hari Suci Nyepi Saka 1949 DIY.",
    closing: "Terima kasih atas kehadiran dan kerja sama Bapak/Ibu/Saudara. Om Santi Santi Santi Om.",
    starts_at: "2026-10-12T18:00:00+07:00", ends_at: "2026-10-12T21:00:00+07:00", timezone: "Asia/Jakarta",
    venue_name: "PT. Werkudara", address: "Jl. Bhinneka No. 09 RT 03/RW 07, Pondok, Condong Catur, Depok, Sleman",
    location_url: "https://maps.app.goo.gl/ctLcnKszth9QX83AA", location_embed_url: "", location_display: "manual",
    arrival_notes: "", review_url: "", review_enabled: false, review_heading: "", review_description: "", review_button_label: "", rsvp_enabled: true, rsvp_closes_at: null, invitation_mode: "open",
    feedback_enabled: false, feedback_opens_at: null, feedback_description: "",
    contact: { name: "", phone: "", channel: "whatsapp", heading: "", description: "", role: "", organization: "", photo: { url: "", alt: "", srcset: [] }, staff_id: "" },
    team_image: { url: "", alt: "", srcset: [] },
    sections: ["about", "experience", "agenda", "location", "prepare", "team", "rsvp", "contact", "feedback"].map(key => ({ key: key as EventRecord["sections"][number]["key"], enabled: !["contact", "team", "experience", "prepare"].includes(key) })),
    topics: [
      { title: "Agenda kegiatan", description: "Meninjau seluruh rangkaian kegiatan yang direncanakan dalam Grand Design." },
      { title: "Penyederhanaan kegiatan", description: "Mengidentifikasi kegiatan yang dapat digabung atau disederhanakan." },
      { title: "Green Dharma", description: "Mendiskusikan kemungkinan penggabungan kegiatan, misalnya Dharma Sadhana dan Green Dharma lintas iman." },
      { title: "Pemaparan koordinator", description: "Koordinator menyampaikan gambaran acara, petugas, dan kebutuhan terkait." },
    ],
    agenda: [
      { id: "20f3a511-2331-4000-8000-000000000001", starts_at: "2026-10-12T18:00:00+07:00", ends_at: "2026-10-12T18:10:00+07:00", title: "Kedatangan peserta", description: "Persiapan peserta", sort_order: 0 },
      { id: "20f3a511-2331-4000-8000-000000000002", starts_at: "2026-10-12T18:10:00+07:00", ends_at: "2026-10-12T19:00:00+07:00", title: "Meeting", description: "Sesi pembahasan pertama", sort_order: 1 },
      { id: "20f3a511-2331-4000-8000-000000000003", starts_at: "2026-10-12T19:00:00+07:00", ends_at: "2026-10-12T19:30:00+07:00", title: "Makan malam", description: "Istirahat bersama", sort_order: 2 },
      { id: "20f3a511-2331-4000-8000-000000000004", starts_at: "2026-10-12T19:30:00+07:00", ends_at: "2026-10-12T21:00:00+07:00", title: "Meeting lanjutan", description: "Sesi pembahasan kedua dan penutup", sort_order: 3 },
    ],
    feedback_questions: [], venue_image_url: "", venue_image_alt: "", venue_image_credit: "",
    hero: { url: "", alt: "", srcset: [], focus: "center", text_position: "left" }, gallery: [],
    event_kind: "acara", audience: "external", theme: { key: "werkudara", corners: "square" }, phase_override: "auto",
    experience: { title: "", story: "", image: { url: "", alt: "", srcset: [] }, moments: [] },
    route: { map_image: { url: "", alt: "", srcset: [] }, steps: [] }, day_note: "",
    after: { title: "", message: "", image: { url: "", alt: "", srcset: [] }, collaboration: { enabled: false, title: "", description: "", button_label: "" } },
    prepare: { title: "", intro: "", items: [] },
    language: "id",
    guest_estimate: null,
    agenda_details: {}, presentation_pdf_url: "",
    emergency: { name: "", phone: "", hospital: "", hospital_address: "", hospital_maps_url: "" },
    poster: emptyPoster(),
    guide: emptyGuide(),
    donation: emptyDonation(),
    translations: { en: {
      title: "", subtitle: "", greeting: "", introduction: "", closing: "", arrival_notes: "", day_note: "",
      experience_title: "", experience_story: "", prepare_title: "", prepare_intro: "", after_title: "", after_message: "",
      contact_heading: "", contact_description: "", feedback_description: "", review_heading: "", review_description: "", review_button_label: "",
      agenda: {},
    } },
    created_at: "2026-10-09T00:00:00Z", updated_at: "2026-10-09T00:00:00Z",
  };
}

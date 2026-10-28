import type { GuideLayout, GuidePart } from "./guide";
import type { EventAudience, EventKind, SectionKey, ThemeKey } from "./types";
import { templateContent } from "./wording/template-content";

export const templateKeys = ["kunjungan-klien", "gala-dinner", "seminar-launching", "annual-meeting", "nyadran", "csr-kegiatan-sosial", "pelatihan-bootcamp", "trip-klien", "poster-sesi", "e-guide", "panduan-lokasi"] as const;
export type TemplateKey = (typeof templateKeys)[number];
/** Offered to regular admins until the super admin chooses otherwise: hosting clients first. */
export const defaultTemplates: readonly TemplateKey[] = ["kunjungan-klien", "trip-klien", "panduan-lokasi"];

export type EventTemplate = {
  key: TemplateKey; label: string; description: string;
  /** Example event name, offered as a chip under the title field. */
  example: string;
  /** More names to offer as chips, after `example`. */
  examples?: string[];
  kind: EventKind; audience: EventAudience; theme: ThemeKey;
  /** Sections shown from the start; the rest exist but stay hidden. */
  modules: SectionKey[];
  /** Preparation cards to start with: titles only, the admin writes the details. */
  prepare: { icon: "shirt" | "backpack" | "gift"; title: string }[];
  /** A Studio Poster preset switched on from the start (src/lib/poster-presets.ts). */
  poster?: string;
  /**
   * E-Guide: the chapters to start with (titles only, the admin writes the content) and the book's
   * order, where a number is the index of a chapter in `chapters` and a word is a part of the event.
   */
  guide?: { chapters: { layout: GuideLayout; title: string }[]; order: (number | GuidePart)[] };
};

const DRESS = { icon: "shirt", title: "Dress code" } as const;
const BRING = { icon: "backpack", title: "Yang perlu dibawa" } as const;
const PROVIDED = { icon: "gift", title: "Yang kami siapkan untuk Anda" } as const;

// Kind, audience and theme follow the notes column of docs/wording-draf.xlsx ("Isi awal templat").
export const eventTemplates: EventTemplate[] = [
  // The key stays "kunjungan-klien": the super admin's template choices are saved under it.
  { key: "kunjungan-klien", label: "Kunjungan Kantor", example: "Kunjungan PT Sinar Abadi ke Werkudara", examples: ["Presentasi & training bersama vendor"], description: "Tamu dari luar berkunjung ke kantor Werkudara: tentang kunjungan, cara datang, rundown, Kenali Tim, konfirmasi kedatangan, kontak pendamping, survei, dan brief tamu di BEO.", kind: "kunjungan", audience: "external", theme: "werkudara", modules: ["about", "agenda", "location", "team", "rsvp", "contact", "feedback"], prepare: [] },
  { key: "gala-dinner", label: "Gala dinner", example: "Malam Apresiasi Werkudara 2026", description: "Malam apresiasi: tema Malam Apresiasi, dress code, RSVP dengan kebutuhan makanan.", kind: "acara", audience: "external", theme: "gala", modules: ["about", "experience", "agenda", "location", "prepare", "rsvp", "contact", "feedback"], prepare: [DRESS] },
  { key: "seminar-launching", label: "Seminar / launching", example: "Peluncuran Layanan Baru Werkudara", description: "Sesi berbagi atau peluncuran: topik, rundown, lokasi, RSVP, dan survei.", kind: "acara", audience: "external", theme: "werkudara", modules: ["about", "agenda", "location", "rsvp", "contact", "feedback"], prepare: [] },
  { key: "annual-meeting", label: "Annual meeting", example: "Annual Meeting Werkudara 2026", description: "Pertemuan tahunan tim: agenda, lokasi, dress code, dan RSVP internal.", kind: "acara", audience: "internal", theme: "werkudara", modules: ["about", "agenda", "location", "prepare", "rsvp", "contact"], prepare: [DRESS] },
  { key: "nyadran", label: "Nyadran", example: "Nyadran Bersama Keluarga Werkudara", description: "Tradisi bersama: tema Khidmat, pakaian dan bawaan, titik kumpul, RSVP internal.", kind: "acara", audience: "internal", theme: "khidmat", modules: ["about", "experience", "agenda", "location", "prepare", "rsvp", "contact"], prepare: [DRESS, BRING] },
  { key: "csr-kegiatan-sosial", label: "Friday Sharing (CSR)", example: "Friday Sharing: Berbagi untuk Panti Asuhan", examples: ["Friday Sharing: Peduli Banjir Demak", "Friday Sharing: Santunan Ramadan"], description: "Bukan undangan: halaman donasi sederhana. Total yang terkumpul (dana dan barang), daftar donatur, penerima bantuan, form donasi dengan pilihan bantuan, rekening/QRIS, dan kabar WhatsApp saat bantuan diserahkan.", kind: "csr", audience: "external", theme: "berbagi", modules: ["about", "contact"], prepare: [] },
  { key: "pelatihan-bootcamp", label: "Pelatihan / bootcamp", example: "Sales Mastery Bootcamp Batch 3", description: "Program beberapa hari: jadwal per hari, bawaan peserta, RSVP, dan survei.", kind: "program", audience: "internal", theme: "werkudara", modules: ["about", "agenda", "location", "prepare", "rsvp", "contact", "feedback"], prepare: [BRING] },
  { key: "trip-klien", label: "Trip klien", example: "Trip Lombok bersama PT Sinar Abadi", description: "Perjalanan bersama klien (struktur Lombok Guidebook): jadwal per hari, bawaan, perlengkapan, kontak.", kind: "program", audience: "external", theme: "nenek", modules: ["about", "experience", "agenda", "location", "prepare", "rsvp", "contact", "feedback"], prepare: [BRING, PROVIDED] },
  { key: "poster-sesi", label: "Kartu: poster, ucapan, ID card, sertifikat", example: "Poster sesi JCWF 2026", examples: ["ID card peserta JCWF 2026", "Sertifikat peserta JCWF 2026", "Kartu ucapan Hari Raya"], description: "Bukan undangan: kartu yang diisi sendiri oleh peserta (poster sesi, kartu ucapan, ID card, sertifikat, undangan singkat), lalu diunduh dan dibagikan.", kind: "kartu", audience: "external", theme: "rempah", modules: [], prepare: [], poster: "rempah-nusantara" },
  {
    key: "e-guide", label: "E-Guide destinasi", example: "Mengenal Lombok", examples: ["Panduan Trip Bali", "Mengenal Yogyakarta"],
    description: "Bukan undangan: buku panduan digital untuk tamu, dibaca bab demi bab. Kenapa ke sini, tempat yang dikunjungi, budaya dan kuliner, jadwal, lokasi, persiapan, dan kontak. Tanpa RSVP dan tiket.",
    kind: "eguide", audience: "external", theme: "nenek", modules: ["experience", "agenda", "location", "prepare", "contact"], prepare: [BRING],
    guide: {
      chapters: [
        { layout: "story", title: "Kenapa ke sini" },
        { layout: "cards", title: "Tempat yang dikunjungi" },
        { layout: "cards", title: "Budaya, kuliner, dan bahasa" },
        { layout: "tips", title: "Tips praktis" },
      ],
      order: [0, "experience", 1, "location", "agenda", 2, "prepare", 3, "contact"],
    },
  },
  // Starts filled with Werkudara's own guide (src/lib/place-guide.ts); only the host comes from the setup.
  {
    key: "panduan-lokasi", label: "Panduan lokasi", example: "Your Visit to Werkudara", examples: ["Panduan ke Werkudara", "Cara ke lokasi acara"],
    description: "Bukan undangan: halaman umum untuk menemukan tempat. Sambutan dengan foto sampul, Getting Here (peta, alamat, langkah rute bergambar, info kedatangan, PIC), galeri foto, dan tombol Google Maps yang selalu terlihat. Terisi dengan data dan foto Werkudara; semuanya bisa diubah untuk lokasi lain.",
    kind: "panduan", audience: "external", theme: "werkudara", modules: ["location", "contact"], prepare: [],
  },
];

export function templateOf(key: string): EventTemplate | undefined {
  return eventTemplates.find(template => template.key === key);
}

/** A template's own starting sentence for a field (greeting, intro, closing, …), or "". */
export function templateText(key: string, field: "greeting" | "intro" | "closing"): string {
  return templateContent[`${key}.${field}`]?.id ?? "";
}

/** The three standard survey questions from the wording sheet. */
export function standardQuestions() {
  return [
    { label: templateContent["survey.q1"]?.id ?? "Secara keseluruhan, seberapa puas Anda dengan acara ini?", kind: "rating" as const, required: true },
    { label: templateContent["survey.q2"]?.id ?? "Apa yang paling berkesan bagi Anda?", kind: "text" as const, required: false },
    { label: templateContent["survey.q3"]?.id ?? "Apa yang bisa kami tingkatkan?", kind: "text" as const, required: false },
  ];
}

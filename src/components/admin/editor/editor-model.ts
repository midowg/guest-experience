import { POSTER_LABEL } from "@/lib/poster";
import { guidePartLabels, type GuidePart } from "@/lib/guide";
import type { EventRecord, HeroTextPosition, ImageFocus, ImageSource, PlainImage, SectionKey } from "@/lib/types";
import { getFraming, normalizeEvent } from "@/lib/hero-framing";
import { parseLocationEmbed } from "@/lib/location-embed";
import { tzLabel } from "@/lib/timezones";
import { translationGaps } from "@/lib/wording/localize";

export const sectionLabels: Record<SectionKey, string> = { about: "Tentang acara & topik", experience: "Pengalaman kunjungan", agenda: "Rundown", location: "Lokasi", prepare: "Persiapan tamu", team: "Our Team", rsvp: "Konfirmasi kehadiran", contact: "Kontak", feedback: "Survei feedback" };
export const sectionKeys = Object.keys(sectionLabels) as SectionKey[];

/**
 * The crop is no longer a choice: every hero is centred. The constant stays so the one place
 * that still needs the value — `prepareEvent` — does not hard-code a bare string.
 */
export const HERO_FOCUS: ImageFocus = "center";
/** Text placement is the hero's only control, and only the hero has it. */
export const heroTextPositionLabels: Record<HeroTextPosition, string> = { left: "Rata kiri", center: "Rata tengah" };
export const heroTextPositionHints: Record<HeroTextPosition, string> = {
  left: "Judul dan sapaan menempel ke tepi kiri bawah foto.",
  center: "Judul dan sapaan berada di tengah bawah foto.",
};

export const heroTextPositionOptions = (Object.keys(heroTextPositionLabels) as HeroTextPosition[]).map(value => ({ value, label: heroTextPositionLabels[value] }));

/** Short, concrete guidance so an admin can judge a photo before uploading it. */
export const photoGuidance = [
  "Foto latar: 2400 × 1500 px.",
  "Foto galeri: 1600 × 1000 px.",
  "Rasio 16:10 (lanskap).",
  "Berkas 300 KB – 1,5 MB.",
  "Hindari objek penting di tepi; tepi terpotong pada layar ponsel.",
];

/** `srcSet` is omitted entirely for photos from outside links, which have no generated sizes. */
export function srcsetAttribute(srcset: ImageSource[]): string | undefined {
  return srcset.length ? srcset.map(source => `${source.url} ${source.width}w`).join(", ") : undefined;
}

export function completeSections(event: EventRecord): EventRecord {
  const sections = [...event.sections];
  for (const key of sectionKeys) {
    if (sections.some(section => section.key === key)) continue;
    const before = key === "contact" ? "feedback" : key === "team" || key === "prepare" ? "rsvp" : key === "experience" ? "agenda" : null;
    const index = before ? sections.findIndex(section => section.key === before) : -1;
    sections.splice(index < 0 ? sections.length : index, 0, { key, enabled: false });
  }
  return { ...normalizeEvent(event), sections };
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Generated sizes belong to a photo; without the photo they are stale and the schema rejects them. */
function cleanImage(image: PlainImage): PlainImage {
  return { ...image, srcset: image.url ? image.srcset : [], alt: image.url ? image.alt : "" };
}

export function prepareEvent(event: EventRecord): EventRecord {
  return {
    ...event,
    location_embed_url: parseLocationEmbed(event.location_embed_url) ?? event.location_embed_url,
    // Generated sizes belong to a photo; without a hero photo they are stale and the schema rejects them.
    // `focus` is no longer an editor control, so a saved event always carries the centred crop,
    // including older events whose stored value was top or bottom.
    hero: { ...event.hero, focus: HERO_FOCUS, framing: getFraming(event.hero), srcset: event.hero.url ? event.hero.srcset : [] },
    team_image: cleanImage(event.team_image),
    experience: { ...event.experience, image: cleanImage(event.experience.image), moments: event.experience.moments.filter(item => item.title.trim() || item.description.trim()) },
    route: { map_image: cleanImage(event.route.map_image), steps: event.route.steps.filter(step => step.title.trim() || step.description.trim() || step.image.url).map(step => ({ ...step, image: cleanImage(step.image) })), points: (event.route.points ?? []).filter(point => point.title.trim() || point.description.trim()) },
    after: { ...event.after, image: cleanImage(event.after.image) },
    // Blank lines are kept while typing (so Enter works) and dropped here, before validation.
    prepare: { ...event.prepare, items: event.prepare.items
      .map(item => ({ ...item, title: item.title.trim(), list: item.list.map(line => line.trim()).filter(Boolean), ...(item.en ? { en: { ...item.en, list: item.en.list.map(line => line.trim()).filter(Boolean) } } : {}) }))
      .filter(item => item.title || item.description.trim() || item.list.length) },
    agenda: event.agenda.map((item, sort_order) => ({ ...item, sort_order })),
    // Details keyed by session id leave with their session, and an all-empty detail is not stored.
    agenda_details: Object.fromEntries(Object.entries(event.agenda_details).filter(([id, detail]) => event.agenda.some(item => item.id === id)
      && (detail.teaser.trim() || detail.did_you_know.trim() || detail.more_story.trim() || detail.place.trim() || detail.pdf_page))),
    // English rundown texts are keyed by session id; a deleted session takes its translation with it.
    translations: { ...event.translations, en: { ...event.translations.en, agenda: Object.fromEntries(Object.entries(event.translations.en.agenda).filter(([id]) => event.agenda.some(item => item.id === id))) } },
    gallery: event.gallery.filter(item => item.url.trim() || item.caption.trim() || item.alt.trim() || item.srcset.length).map((item, sort_order) => ({ ...item, sort_order })),
    feedback_questions: event.feedback_questions.map((item, sort_order) => ({ ...item, options: item.kind === "choice" ? item.options.map(option => option.trim()).filter(Boolean) : [], sort_order })),
    // E-Guide: empty items are dropped, and the order keeps only chapters that still exist.
    guide: {
      ...event.guide,
      cover: { ...event.guide.cover, photo: cleanImage(event.guide.cover.photo) },
      chapters: event.guide.chapters.map(chapter => ({ ...chapter, photo: cleanImage(chapter.photo), items: chapter.items
        .filter(item => item.title.trim() || item.text.trim() || item.fact.trim() || item.photo.url || item.link.trim())
        .map(item => ({ ...item, photo: cleanImage(item.photo) })) })),
      order: event.guide.order.filter(step => step.kind === "part" || event.guide.chapters.some(chapter => chapter.id === step.id)),
    },
  };
}

export function hiddenSectionReasons(event: EventRecord): string[] {
  // A Panduan lokasi has one fixed shape: only empty parts are worth a note.
  if (event.event_kind === "panduan") {
    const reasons: string[] = [];
    if (!event.hero.url) reasons.push("Belum ada foto sampul; sambutan tampil tanpa foto.");
    if (!event.contact?.name || !event.contact.phone) reasons.push("PIC belum diisi; kartu \"Tersesat? Tanya kami\" tidak ditampilkan.");
    if (!event.route.steps.length) reasons.push("Belum ada langkah rute.");
    if (!event.gallery.length) reasons.push("Galeri kosong; bagian Gallery disembunyikan.");
    return reasons;
  }
  // An E-Guide has no RSVP, survey or review: only its parts left out of the book are worth a note.
  if (event.event_kind === "eguide") {
    const reasons = (Object.keys(guidePartLabels) as GuidePart[]).filter(part => !event.guide.order.some(step => step.kind === "part" && step.part === part)).map(part => `${guidePartLabels[part]} belum dimasukkan ke urutan baca.`);
    if (sectionOn(event, "contact") && (!event.contact?.name || !event.contact.phone)) reasons.push("Kontak PIC belum diisi; bagian kontak tidak ditampilkan.");
    if (!event.guide.chapters.length) reasons.push("Belum ada bab panduan.");
    return reasons;
  }
  const reasons = event.sections.filter(section => !section.enabled).map(section => `${sectionLabels[section.key]} disembunyikan melalui pengaturan bagian.`);
  if (!event.rsvp_enabled) reasons.push("Formulir RSVP dinonaktifkan.");
  if (event.sections.some(section => section.key === "contact" && section.enabled) && (!event.contact?.name || !event.contact.phone)) reasons.push("Kontak PIC belum diisi; bagian kontak tidak ditampilkan.");
  if (!event.feedback_enabled) reasons.push("Survei feedback dinonaktifkan.");
  else if (!event.feedback_questions.length) reasons.push("Survei belum memiliki pertanyaan; lengkapi atau nonaktifkan sebelum publikasi.");
  if (!event.review_enabled || !event.review_url) reasons.push("Tautan review tidak ditampilkan sampai diaktifkan dan diisi.");
  if (!event.hero.url) reasons.push("Tidak ada foto latar; pembuka memakai tata letak editorial tanpa foto.");
  if (!event.gallery.length) reasons.push("Galeri foto lokasi kosong; informasi lokasi tetap tersedia sesuai tampilan yang dipilih.");
  return reasons;
}

export type EditorStage = "prep" | "guest" | "day" | "after" | "settings";
export const editorStages: { key: EditorStage; label: string }[] = [
  { key: "prep", label: "Persiapan" }, { key: "guest", label: "Tamu" }, { key: "day", label: "Hari H" },
  { key: "after", label: "Sesudah acara" }, { key: "settings", label: "Pengaturan" },
];
/** Every editor block in page order: the side menu and each block's header read from this one list. */
export const editorBlocks: { id: string; title: string; stage: EditorStage }[] = [
  { id: "identity", title: "Identitas & undangan", stage: "prep" },
  { id: "appearance", title: "Jenis, audiens, dan tampilan", stage: "prep" },
  { id: "schedule", title: "Waktu acara", stage: "prep" },
  { id: "hero", title: "Foto latar pembuka", stage: "prep" },
  // E-Guide only (src/lib/admin-modules.ts kindBlocks): the book's cover, chapters and order.
  { id: "guide", title: "Bab panduan", stage: "prep" },
  { id: "topics", title: "Topik pembahasan", stage: "prep" },
  { id: "experience", title: "Pengalaman kunjungan", stage: "prep" },
  { id: "agenda", title: "Rundown", stage: "prep" },
  { id: "venue", title: "Lokasi", stage: "prep" },
  { id: "gallery", title: "Galeri foto lokasi Werkudara", stage: "prep" },
  { id: "prepare", title: "Persiapan tamu", stage: "prep" },
  { id: "team", title: "Our Team", stage: "prep" },
  { id: "rsvp", title: "Penerimaan RSVP", stage: "guest" },
  { id: "contact", title: "Kontak", stage: "guest" },
  { id: "poster", title: POSTER_LABEL, stage: "guest" },
  // Friday Sharing (CSR) only: what can be given, how to pay, who receives it, what the page shows, the handover news.
  { id: "donation-style", title: "Tema halaman", stage: "prep" },
  { id: "donation-items", title: "Pilihan bantuan", stage: "guest" },
  { id: "donation-pay", title: "Rekening & QRIS", stage: "guest" },
  { id: "donation-recipients", title: "Penerima bantuan", stage: "guest" },
  { id: "donation-show", title: "Yang tampil di halaman", stage: "guest" },
  { id: "donation-news", title: "Kabar penyerahan", stage: "after" },
  { id: "day", title: "Hari H", stage: "day" },
  { id: "feedback_questions", title: "Survei feedback", stage: "after" },
  { id: "review", title: "Ulasan Google (opsional)", stage: "after" },
  { id: "after", title: "Setelah acara", stage: "after" },
  // Kunjungan Kantor only: the visit's photos live on the Foto page; the menu points there.
  { id: "photos", title: "Foto kunjungan", stage: "after" },
  { id: "language", title: "Bahasa & terjemahan", stage: "settings" },
  { id: "sections", title: "Urutan & tampilan bagian", stage: "settings" },
  { id: "publication", title: "Status & penyimpanan", stage: "settings" },
];

/** Which editor block owns a field: the first segment of a dotted path decides. */
const fieldBlocks: Record<string, string> = {
  title: "identity", slug: "identity", subtitle: "identity", organizer: "identity", greeting: "identity", introduction: "identity", closing: "identity", invitation_mode: "identity",
  event_kind: "appearance", audience: "appearance", theme: "appearance", phase_override: "appearance",
  starts_at: "schedule", ends_at: "schedule", timezone: "schedule",
  hero: "hero", topics: "topics", experience: "experience", agenda: "agenda",
  venue_name: "venue", address: "venue", location_url: "venue", location_embed_url: "venue", location_display: "venue", arrival_notes: "venue", route: "venue",
  gallery: "gallery", venue_image_url: "gallery", venue_image_alt: "gallery", venue_image_credit: "gallery",
  agenda_details: "agenda", presentation_pdf_url: "agenda", emergency: "contact",
  team_image: "team", rsvp_enabled: "rsvp", rsvp_closes_at: "rsvp", guest_estimate: "rsvp", contact: "contact", day_note: "day", day_enabled: "day",
  feedback_enabled: "feedback_questions", feedback_opens_at: "feedback_questions", feedback_description: "feedback_questions", feedback_questions: "feedback_questions",
  review_url: "review", review_enabled: "review", review_heading: "review", review_description: "review", review_button_label: "review",
  after: "after", prepare: "prepare", language: "language", translations: "language", sections: "sections", status: "publication", poster: "poster", guide: "guide",
};
/** Friday Sharing's settings are split over several blocks: the second segment of donation.* decides. */
const donationBlocks: Record<string, string> = {
  enabled: "donation-items", items: "donation-items", goodsNote: "donation-items", closesAt: "donation-items",
  accounts: "donation-pay", qris: "donation-pay", proofRequired: "donation-pay",
  style: "donation-style", askPhone: "donation-show", recipients: "donation-recipients", show: "donation-show", delivered: "donation-news", notify: "donation-news",
};
/**
 * Kunjungan Kantor's menu follows the guest's screens (board 12), so some fields sit in another
 * block than in an invitation: the date and address in Info kunjungan, the greeting with the
 * cover photo in Sambutan, the reason with the topics, the survey and review with the thank-you.
 */
const visitFields: Record<string, string> = {
  starts_at: "identity", ends_at: "identity", timezone: "identity", venue_name: "identity", address: "identity",
  greeting: "hero", subtitle: "hero", introduction: "topics", closing: "after",
  feedback_enabled: "after", feedback_opens_at: "after", feedback_description: "after", feedback_questions: "after",
  review_url: "after", review_enabled: "after", review_heading: "after", review_description: "after", review_button_label: "after",
  gallery: "venue", venue_image_url: "venue", venue_image_alt: "venue", venue_image_credit: "venue", sections: "identity",
};
/** Panduan lokasi: the welcome's texts sit with the cover photo in Sambutan. */
const placeFields: Record<string, string> = { place_theme: "identity", subtitle: "hero", greeting: "hero", introduction: "hero", closing: "gallery", sections: "identity" };
export function blockOfPath(path: string, kind?: EventRecord["event_kind"]): string {
  const [first, second] = path.split(".");
  if (first === "donation") return donationBlocks[second] ?? "donation-items";
  if (kind === "kunjungan" && visitFields[first]) return visitFields[first];
  if (kind === "panduan" && placeFields[first]) return placeFields[first];
  return fieldBlocks[first] ?? "identity";
}

/**
 * Friday Sharing (CSR) has its own menu, not the invitation's: shared blocks are renamed and
 * regrouped for a donation page, and the stages read Halaman · Donasi · Penyaluran · Pengaturan.
 */
const csrBlocks: Record<string, { title: string; stage: EditorStage }> = {
  identity: { title: "Judul & cerita", stage: "prep" },
  hero: { title: "Foto sampul", stage: "prep" },
  contact: { title: "Kontak panitia", stage: "prep" },
  publication: { title: "Terbitkan", stage: "settings" },
};
const csrStages: Partial<Record<EditorStage, string>> = { prep: "Halaman", guest: "Donasi", after: "Penyaluran", settings: "Pengaturan" };
/**
 * Kunjungan Kantor has its own menu too (board 12): one item per guest screen, in the order the
 * guest opens them, from Sambutan to the photos. Its stages read Acara · Sebelum kunjungan ·
 * Setelah kunjungan · Pengaturan.
 */
export const visitMenu: { id: string; title: string; stage: EditorStage; hint: string }[] = [
  { id: "identity", title: "Info kunjungan", stage: "prep", hint: "Nama kunjungan, tanggal, jam, alamat, dan cara mengundang. Dipakai di kartu sambutan dan BEO." },
  { id: "hero", title: "Sambutan", stage: "guest", hint: "Layar pertama yang dibuka tamu dari tautan." },
  { id: "topics", title: "Tentang kunjungan", stage: "guest", hint: "Tujuan kunjungan dan topik yang dibahas." },
  { id: "rsvp", title: "Konfirmasi kedatangan", stage: "guest", hint: "Form satu layar: nama, rombongan, dan kebutuhan khusus." },
  { id: "venue", title: "Cara datang", stage: "guest", hint: "Peta, petunjuk, rute bergambar, dan foto lokasi." },
  { id: "agenda", title: "Rundown", stage: "guest", hint: "Susunan acara per jam. Matikan kalau kunjungan tidak punya jadwal rinci." },
  { id: "day", title: "Hari H", stage: "guest", hint: "Catatan yang tampil pada hari kunjungan, bersama sesi yang sedang berlangsung. Matikan kalau tamu cukup melihat sambutan seperti hari sebelumnya." },
  { id: "team", title: "Kenali Tim Werkudara", stage: "guest", hint: "Sedikit tentang tim Werkudara yang inklusif. Matikan kalau tidak diperlukan." },
  { id: "contact", title: "Pendamping kunjungan", stage: "guest", hint: "Orang yang bisa ditanya tamu sebelum dan saat kunjungan." },
  { id: "after", title: "Terima kasih & survei", stage: "after", hint: "Halaman yang dikirim setelah kunjungan: ucapan, survei, dan ulasan." },
  { id: "photos", title: "Foto kunjungan", stage: "after", hint: "Foto dibagikan lewat halaman terima kasih." },
  { id: "appearance", title: "Jenis, audiens, dan tampilan", stage: "settings", hint: "" },
  { id: "language", title: "Bahasa & terjemahan", stage: "settings", hint: "Isi dalam Indonesia, English, atau keduanya." },
  { id: "publication", title: "Terbitkan", stage: "settings", hint: "Draf hanya terlihat di admin. Setelah terbit, siapa pun yang punya tautan bisa membukanya." },
];
const visitStages: Partial<Record<EditorStage, string>> = { prep: "Acara", guest: "Sebelum kunjungan", after: "Setelah kunjungan", settings: "Pengaturan" };
/** Panduan lokasi's menu: the page's parts in reading order, from Sambutan to the gallery. */
export const placeMenu: { id: string; title: string; stage: EditorStage; hint: string }[] = [
  { id: "identity", title: "Info panduan", stage: "prep", hint: "Judul, tautan untuk dibagikan, dan tuan rumah." },
  { id: "hero", title: "Sambutan", stage: "guest", hint: "Foto sampul, judul, dan beberapa kalimat sambutan." },
  { id: "venue", title: "Getting Here", stage: "guest", hint: "Alamat, tombol Google Maps, peta rute, langkah bergambar, dan info kedatangan." },
  { id: "contact", title: "PIC", stage: "guest", hint: "Orang yang bisa dihubungi tamu yang tersesat (kartu \"Tersesat? Tanya kami\")." },
  { id: "gallery", title: "Galeri", stage: "guest", hint: "Foto tempat, berderet memenuhi lebar halaman." },
  { id: "appearance", title: "Jenis, audiens, dan tampilan", stage: "settings", hint: "" },
  { id: "language", title: "Bahasa & terjemahan", stage: "settings", hint: "ID saja, EN saja, atau keduanya dengan tombol ID/EN." },
  { id: "publication", title: "Terbitkan", stage: "settings", hint: "Draf hanya terlihat di admin. Setelah terbit, siapa pun yang punya tautan bisa membukanya." },
];
const placeStages: Partial<Record<EditorStage, string>> = { prep: "Halaman", guest: "Isi panduan", settings: "Pengaturan" };
/** The blocks of the menu for a kind of event, with that kind's names, order, and grouping. */
export function blocksFor(kind: EventRecord["event_kind"] | undefined): { id: string; title: string; stage: EditorStage }[] {
  if (kind === "kunjungan") return visitMenu;
  if (kind === "panduan") return placeMenu;
  return kind === "csr" ? editorBlocks.map(item => csrBlocks[item.id] ? { ...item, ...csrBlocks[item.id] } : item) : editorBlocks;
}
/** The menu's stage headings for a kind of event. */
export function stagesFor(kind: EventRecord["event_kind"] | undefined) {
  const names = kind === "csr" ? csrStages : kind === "kunjungan" ? visitStages : kind === "panduan" ? placeStages : null;
  return names ? editorStages.filter(stage => names[stage.key]).map(stage => ({ ...stage, label: names[stage.key]! })) : editorStages;
}

export type BlockStatus = "error" | "dirty" | "todo" | "optional" | "done";
export const blockStatusLabels: Record<BlockStatus, string> = { error: "Perlu diperbaiki", dirty: "Belum disimpan", todo: "Perlu dilengkapi", optional: "Opsional", done: "Lengkap" };

const kindLabels = { kunjungan: "Welcome", acara: "Acara", program: "Program", kartu: "Kartu", eguide: "E-Guide", csr: "Friday Sharing (CSR)", panduan: "Panduan lokasi" } as const;
const phaseText = { auto: "fase otomatis", before: "selalu undangan", day: "selalu hari H", after: "selalu terima kasih" } as const;
const sectionOn = (event: EventRecord, key: SectionKey) => event.sections.some(section => section.key === key && section.enabled);
const count = (n: number, noun: string) => `${n} ${noun}`;

/** One line describing what a block currently holds, for its summary card. */
export function blockSummary(id: string, event: EventRecord, themeName: string, formatWhen: (iso: string) => string): string {
  switch (id) {
    case "identity": return `${event.title || "Tanpa judul"} · ${event.invitation_mode === "personal" ? "tautan per tamu" : "tautan umum"}`;
    case "appearance": return `${kindLabels[event.event_kind] ?? "Acara"} · ${event.audience === "internal" ? "Internal" : "Eksternal"} · ${themeName} · ${phaseText[event.phase_override] ?? "fase otomatis"}`;
    case "schedule": return event.starts_at ? `${formatWhen(event.starts_at)}${event.ends_at ? ` – ${formatWhen(event.ends_at).split(", ").pop()}` : ""} ${tzLabel(event.timezone)}` : "Waktu belum diisi";
    case "hero": return event.hero.url ? `Foto terpasang · teks ${event.hero.text_position === "center" ? "rata tengah" : "rata kiri"}` : "Belum ada foto";
    case "topics": return event.topics.length ? count(event.topics.length, "topik") : "Belum ada topik";
    case "experience": return sectionOn(event, "experience") ? `${event.experience.story ? "Cerita terisi" : "Cerita belum diisi"} · ${count(event.experience.moments.length, "momen")}` : "Nonaktif";
    case "agenda": return event.agenda.length ? count(event.agenda.length, "sesi") : "Rundown belum diisi";
    case "venue": {
      const place = (event.location_display === "embed" ? "Peta sematan Google" : event.venue_name) || "Lokasi belum diisi";
      return event.route.steps.length ? `${place} · ${count(event.route.steps.length, "langkah rute")}` : place;
    }
    case "gallery": return event.gallery.length ? count(event.gallery.length, "foto lokasi") : "Belum ada foto lokasi";
    case "prepare": return sectionOn(event, "prepare") ? (event.prepare.items.length ? event.prepare.items.map(item => item.title).slice(0, 3).join(" · ") : "Tampil · belum ada kartu") : "Nonaktif";
    case "team": return sectionOn(event, "team") ? (event.team_image.url ? "Tampil · dengan foto tim" : "Tampil · tanpa foto") : "Nonaktif";
    case "rsvp": return event.rsvp_enabled ? (event.rsvp_closes_at ? `Dibuka · batas ${formatWhen(event.rsvp_closes_at)}` : "Dibuka · tanpa batas waktu") : "Ditutup";
    case "contact": return event.contact.name && event.contact.phone ? `${event.contact.name} · ${event.contact.channel === "whatsapp" ? "WhatsApp" : "Telepon"}` : "Belum diisi";
    case "day": return event.day_note ? "Catatan untuk tamu terisi" : "Belum ada catatan";
    case "feedback_questions": return event.feedback_enabled ? count(event.feedback_questions.length, "pertanyaan") : "Nonaktif";
    case "review": return event.review_enabled && event.review_url ? "Aktif" : "Nonaktif";
    case "after": return [event.after.message ? "Pesan terisi" : "Pesan memakai Penutup", event.after.collaboration.enabled ? "kolaborasi aktif" : ""].filter(Boolean).join(" · ");
    case "language": {
      if (event.language === "id") return "Bahasa Indonesia saja";
      const gaps = translationGaps(event);
      const mode = event.language === "en" ? "English saja" : "Dua bahasa (ID + EN)";
      return gaps.total ? `${mode} · ${gaps.total - gaps.missing} dari ${gaps.total} teks diterjemahkan` : mode;
    }
    case "sections": return `${event.sections.filter(section => section.enabled).length} dari ${event.sections.length} bagian tampil`;
    case "guide": return event.guide.chapters.length ? `${event.guide.cover.title || "Sampul belum berjudul"} · ${count(event.guide.chapters.length, "bab")}` : "Belum ada bab";
    case "publication": return event.status === "published" ? "Dipublikasikan" : event.status === "archived" ? "Diarsipkan" : "Draf";
    default: return "";
  }
}

/** Blocks that are fine left empty: their card says Opsional instead of Lengkap. */
function isEmptyOptional(id: string, event: EventRecord): boolean {
  switch (id) {
    case "hero": return !event.hero.url;
    case "topics": return !event.topics.length;
    case "experience": return !sectionOn(event, "experience");
    case "gallery": return !event.gallery.length;
    case "prepare": return !sectionOn(event, "prepare");
    case "team": return !sectionOn(event, "team");
    case "day": return !event.day_note;
    case "photos": return true;
    case "feedback_questions": return !event.feedback_enabled;
    case "review": return !event.review_enabled;
    case "poster": return !event.poster.enabled;
    case "after": return !event.after.message && !event.after.title && !event.after.collaboration.enabled;
    case "language": return event.language === "id";
    default: return false;
  }
}

/**
 * Status per block. "Perlu dilengkapi" is whatever publishing would still reject, so the cards
 * and the server agree without a second list of rules.
 */
/** English is offered but some filled-in Indonesian text has no English yet. */
function untranslated(event: EventRecord) {
  return event.language !== "id" && translationGaps(event).missing > 0;
}

export function blockStatuses(event: EventRecord, errors: Record<string, string[]>, dirtyBlocks: Set<string>, publishIssues: string[]): Record<string, BlockStatus> {
  const owner = (path: string) => blockOfPath(path, event.event_kind);
  const errorBlocks = new Set(Object.keys(errors).map(owner));
  const todoBlocks = new Set(publishIssues.map(owner));
  return Object.fromEntries(editorBlocks.map(({ id }) => [id,
    errorBlocks.has(id) ? "error" : dirtyBlocks.has(id) ? "dirty" : todoBlocks.has(id) || (id === "language" && untranslated(event)) ? "todo" : isEmptyOptional(id, event) ? "optional" : "done"]));
}

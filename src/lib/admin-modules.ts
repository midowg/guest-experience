import type { EventKind, EventRecord, SectionKey } from "./types";
import { POSTER_LABEL } from "./poster";

/**
 * Event modules the super admin can switch off for regular admins. "Tentang acara" is the
 * invitation itself and always stays available.
 */
export const adminModules = [
  { key: "experience", label: "Pengalaman kunjungan", description: "Cerita singkat dan momen yang menanti tamu.", group: "Isi undangan" },
  { key: "agenda", label: "Rundown", description: "Jadwal sesi acara.", group: "Isi undangan" },
  { key: "location", label: "Lokasi", description: "Nama tempat, alamat, peta, dan petunjuk kedatangan.", group: "Isi undangan" },
  { key: "route", label: "Panduan rute bergambar", description: "Peta rute dan langkah menuju lokasi, di dalam bagian Lokasi.", group: "Isi undangan" },
  { key: "gallery", label: "Galeri foto lokasi", description: "Foto tempat acara di bagian Lokasi.", group: "Isi undangan" },
  { key: "prepare", label: "Persiapan tamu", description: "Kartu dress code, barang bawaan, dan perlengkapan dari panitia.", group: "Isi undangan" },
  { key: "team", label: "Our Team", description: "Bagian tentang tim Werkudara yang inklusif.", group: "Isi undangan" },
  { key: "rsvp", label: "Konfirmasi kehadiran (RSVP)", description: "Form konfirmasi kehadiran tamu.", group: "Tamu" },
  { key: "personal", label: "Tautan per tamu", description: "Undangan personal dengan nama tamu, impor daftar tamu, dan kirim WhatsApp.", group: "Tamu" },
  { key: "contact", label: "Kontak PIC", description: "Kartu kontak WhatsApp atau telepon panitia.", group: "Tamu" },
  { key: "bilingual", label: "Dua bahasa / English", description: "Halaman tamu dalam English atau dengan tombol ID/EN.", group: "Tamu" },
  { key: "poster", label: POSTER_LABEL, description: "Peserta membuat poster sesinya sendiri dari templat, lalu mengunduh dan membagikannya.", group: "Tamu" },
  { key: "feedback", label: "Survei feedback", description: "Survei pengalaman tamu setelah acara.", group: "Sesudah acara" },
  { key: "review", label: "Ulasan Google", description: "Ajakan sukarela menulis ulasan Google.", group: "Sesudah acara" },
  { key: "collaboration", label: "Ajakan kolaborasi", description: "Kartu ajakan bermitra di halaman terima kasih.", group: "Sesudah acara" },
] as const;
export type AdminModule = (typeof adminModules)[number]["key"];
export const adminModuleKeys = adminModules.map(module => module.key) as AdminModule[];

export function isAdminModule(value: string): value is AdminModule {
  return (adminModuleKeys as string[]).includes(value);
}

const sectionModules: Partial<Record<AdminModule, SectionKey>> = {
  experience: "experience", agenda: "agenda", location: "location", prepare: "prepare", team: "team", rsvp: "rsvp", contact: "contact", feedback: "feedback",
};
const sectionOn = (event: EventRecord, key: SectionKey) => event.sections.some(section => section.key === key && section.enabled);

/** Whether an event currently uses a module. */
export function moduleActive(event: EventRecord, key: AdminModule): boolean {
  const section = sectionModules[key];
  if (key === "rsvp") return sectionOn(event, "rsvp") || event.rsvp_enabled;
  if (key === "feedback") return sectionOn(event, "feedback") || event.feedback_enabled;
  if (section) return sectionOn(event, section);
  switch (key) {
    case "route": return !!event.route?.map_image.url || (event.route?.steps.length ?? 0) > 0;
    case "gallery": return event.gallery.length > 0;
    case "personal": return event.invitation_mode === "personal";
    case "bilingual": return (event.language ?? "id") !== "id";
    case "review": return event.review_enabled;
    case "collaboration": return !!event.after?.collaboration.enabled;
    case "poster": return !!event.poster?.enabled || event.event_kind === "kartu";
    default: return false;
  }
}

/**
 * Modules a regular admin switched on although the super admin turned them off. A module that
 * was already on before the change may stay on (and may be switched off); it cannot come back.
 */
export function blockedChanges(before: EventRecord | null, after: EventRecord, disabled: AdminModule[]): AdminModule[] {
  return disabled.filter(key => moduleActive(after, key) && !(before && moduleActive(before, key)));
}

/** A new event (template, blank, or copy) never starts with a module the admin may not use. */
export function withoutModules(event: EventRecord, disabled: AdminModule[]): EventRecord {
  let next = event;
  const off = new Set(disabled);
  const sections = next.sections.map(section => {
    const owner = (Object.entries(sectionModules) as [AdminModule, SectionKey][]).find(([, key]) => key === section.key)?.[0];
    return owner && off.has(owner) ? { ...section, enabled: false } : section;
  });
  next = { ...next, sections };
  if (off.has("rsvp")) next = { ...next, rsvp_enabled: false };
  if (off.has("feedback")) next = { ...next, feedback_enabled: false };
  if (off.has("route")) next = { ...next, route: { map_image: { url: "", alt: "", srcset: [] }, steps: [], points: [] } };
  if (off.has("gallery")) next = { ...next, gallery: [] };
  if (off.has("personal")) next = { ...next, invitation_mode: "open" };
  if (off.has("bilingual")) next = { ...next, language: "id" };
  if (off.has("review")) next = { ...next, review_enabled: false };
  if (off.has("collaboration")) next = { ...next, after: { ...next.after, collaboration: { ...next.after.collaboration, enabled: false } } };
  // An E-Guide's book leaves out the parts whose module is switched off.
  if (next.guide) next = { ...next, guide: { ...next.guide, order: next.guide.order.filter(step => step.kind !== "part" || !off.has(step.part)) } };
  return next;
}

/** Editor blocks that belong wholly to one module. */
export const moduleBlocks: Partial<Record<AdminModule, string>> = {
  experience: "experience", agenda: "agenda", location: "venue", gallery: "gallery", prepare: "prepare", team: "team", rsvp: "rsvp",
  contact: "contact", feedback: "feedback_questions", review: "review", bilingual: "language", poster: "poster",
};

/**
 * What each kind of event offers, so no event is handed a module that does not fit it.
 *
 * | Kind                         | Modules                                                              | Editor blocks outside any module |
 * |------------------------------|----------------------------------------------------------------------|----------------------------------|
 * | acara / program              | all                                                                  | identity, appearance, schedule, hero, topics, day, after, sections, publication (program also transport, stay, guidelines, contacts) |
 * | kunjungan (Kunjungan Kantor) | all                                                                  | identity, appearance, hero, topics, day, after, photos, publication |
 * | kartu (Studio Poster)        | poster                                                               | appearance, publication          |
 * | eguide (E-Guide)             | experience, agenda, location, route, gallery, prepare, contact, bilingual | identity, appearance, schedule, guide, publication |
 * | csr (Friday Sharing)         | contact                                                              | identity, appearance, hero, donation-*, publication |
 * | panduan (Panduan lokasi)     | location, route, gallery, contact, bilingual                         | identity, appearance, hero, publication |
 *
 * An E-Guide is read, not answered: no RSVP, personal links, tickets, survey, review,
 * collaboration, poster or Our Team. Its order of parts lives in the guide itself, so it has no
 * "Urutan & tampilan bagian", no hero (the cover has its own photo) and no Hari H / thank-you page.
 * A CSR page takes donations instead of answers: only its cover, the donation settings and a contact.
 * A Panduan lokasi is read, like an E-Guide, but has one fixed shape: welcome, the way there, photos.
 */
export const kindModules: Record<EventKind, readonly AdminModule[]> = {
  kunjungan: adminModuleKeys, acara: adminModuleKeys, program: adminModuleKeys,
  kartu: ["poster"],
  eguide: ["experience", "agenda", "location", "route", "gallery", "prepare", "contact", "bilingual"],
  csr: ["contact"],
  panduan: ["location", "route", "gallery", "contact", "bilingual"],
};
const invitationBlocks = ["identity", "appearance", "schedule", "hero", "topics", "day", "after", "sections", "publication"] as const;
/** A trip's handbook parts (src/lib/trip.ts) belong to Program only; they sit under no module of their own. */
const tripBlocks = ["transport", "stay", "guidelines", "contacts"] as const;
export const kindBlocks: Record<EventKind, readonly string[]> = {
  // Kunjungan Kantor's menu (editor-model visitMenu) keeps schedule in Info kunjungan and has no section-order block.
  kunjungan: ["identity", "appearance", "hero", "topics", "day", "after", "photos", "publication"], acara: invitationBlocks, program: [...invitationBlocks, ...tripBlocks],
  kartu: ["appearance", "publication"],
  eguide: ["identity", "appearance", "schedule", "guide", "publication"],
  csr: ["identity", "appearance", "hero", "donation-style", "donation-items", "donation-pay", "donation-recipients", "donation-show", "donation-news", "publication"],
  panduan: ["identity", "appearance", "hero", "publication"],
};
const blockOwner = Object.fromEntries((Object.entries(moduleBlocks) as [AdminModule, string][]).map(([key, id]) => [id, key])) as Record<string, AdminModule>;

/** Whether a kind of event offers a module at all (before the super admin's switches). */
export function kindOffers(kind: EventKind | undefined, key: AdminModule): boolean {
  return (kindModules[kind ?? "acara"] ?? kindModules.acara).includes(key);
}
/** Whether an editor block belongs to this kind of event: through its module, or as one of the kind's own blocks. */
export function blockAllowed(kind: EventKind | undefined, id: string): boolean {
  const owner = blockOwner[id];
  return owner ? kindOffers(kind, owner) : (kindBlocks[kind ?? "acara"] ?? kindBlocks.acara).includes(id);
}

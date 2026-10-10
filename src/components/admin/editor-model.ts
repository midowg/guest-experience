import type { EventRecord, HeroTextPosition, ImageFocus, ImageSource, SectionKey } from "@/lib/types";
import { getFraming, normalizeEvent } from "@/lib/hero-framing";
import { parseLocationEmbed } from "@/lib/location-embed";

export const sectionLabels: Record<SectionKey, string> = { about: "Tentang acara & topik", agenda: "Rundown", location: "Lokasi", rsvp: "Konfirmasi kehadiran", feedback: "Survei feedback" };
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
  return { ...normalizeEvent(event), sections: [...event.sections, ...sectionKeys.filter(key => !event.sections.some(section => section.key === key)).map(key => ({ key, enabled: false }))] };
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function prepareEvent(event: EventRecord): EventRecord {
  return {
    ...event,
    location_embed_url: parseLocationEmbed(event.location_embed_url) ?? event.location_embed_url,
    // Generated sizes belong to a photo; without a hero photo they are stale and the schema rejects them.
    // `focus` is no longer an editor control, so a saved event always carries the centred crop,
    // including older events whose stored value was top or bottom.
    hero: { ...event.hero, focus: HERO_FOCUS, framing: getFraming(event.hero), srcset: event.hero.url ? event.hero.srcset : [] },
    agenda: event.agenda.map((item, sort_order) => ({ ...item, sort_order })),
    gallery: event.gallery.filter(item => item.url.trim() || item.caption.trim() || item.alt.trim() || item.srcset.length).map((item, sort_order) => ({ ...item, sort_order })),
    feedback_questions: event.feedback_questions.map((item, sort_order) => ({ ...item, options: item.kind === "choice" ? item.options.map(option => option.trim()).filter(Boolean) : [], sort_order })),
  };
}

export function hiddenSectionReasons(event: EventRecord): string[] {
  const reasons = event.sections.filter(section => !section.enabled).map(section => `${sectionLabels[section.key]} disembunyikan melalui pengaturan bagian.`);
  if (!event.rsvp_enabled) reasons.push("Formulir RSVP dinonaktifkan.");
  if (!event.feedback_enabled) reasons.push("Survei feedback dinonaktifkan.");
  else if (!event.feedback_questions.length) reasons.push("Survei belum memiliki pertanyaan; lengkapi atau nonaktifkan sebelum publikasi.");
  if (!event.review_enabled || !event.review_url) reasons.push("Tautan review tidak ditampilkan sampai diaktifkan dan diisi.");
  if (!event.hero.url) reasons.push("Tidak ada foto latar; pembuka memakai tata letak editorial tanpa foto.");
  if (!event.gallery.length) reasons.push("Galeri foto lokasi kosong; informasi lokasi tetap tersedia sesuai tampilan yang dipilih.");
  return reasons;
}

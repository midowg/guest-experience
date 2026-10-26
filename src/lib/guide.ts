import type { PlainImage } from "./types";

/**
 * E-Guide (event_kind "eguide"): a digital guidebook read like a book, not an invitation. It has
 * its own chapters, and may bring in parts the event already has (the experience story, the
 * schedule, the place with its route and photos, the preparation cards, the contacts), each as a
 * chapter of its own, in the order the admin sets.
 */

/** How a chapter's items are laid out: a story with points, cards with photos, a phrase list, or short tips. */
export type GuideLayout = "story" | "cards" | "phrases" | "tips";
/** English text beside the Indonesian, shown when the guide is in English or both languages; empty falls back. */
export type GuideItemEn = { title: string; text: string; fact: string };
/**
 * One entry in a chapter: a place (title, story, "Did you know?" fact, photo, map link), a
 * custom or a dish, a phrase (title = the phrase, text = its meaning) or a tip.
 */
export type GuideItem = { id: string; title: string; text: string; fact: string; photo: PlainImage; link: string; en?: GuideItemEn };
export type GuideChapter = { id: string; layout: GuideLayout; title: string; intro: string; photo: PlainImage; items: GuideItem[]; en?: { title: string; intro: string } };
/** A part of the event shown as a chapter of the guide; its content is the event's own. */
export type GuidePart = "experience" | "agenda" | "location" | "prepare" | "contact";
/** One step of the book: a chapter written for the guide, or a part of the event. */
export type GuideStep = { kind: "chapter"; id: string } | { kind: "part"; part: GuidePart };
export type GuideSettings = {
  cover: { eyebrow: string; title: string; subtitle: string; photo: PlainImage; en?: { eyebrow: string; title: string; subtitle: string } };
  chapters: GuideChapter[];
  /** The book's order: its chapters and the event's parts, as the admin arranged them. */
  order: GuideStep[];
};

export const guideLayouts: { key: GuideLayout; label: string; hint: string }[] = [
  { key: "story", label: "Cerita", hint: "Foto, paragraf pembuka, dan poin “yang akan Anda dapat”." },
  { key: "cards", label: "Kartu tempat", hint: "Satu kartu per tempat: foto, cerita, “Tahukah Anda?”, tombol peta." },
  { key: "phrases", label: "Daftar frasa", hint: "Frasa bahasa setempat dan artinya." },
  { key: "tips", label: "Tips singkat", hint: "Daftar singkat: cuaca, pakaian, pembayaran, kesehatan." },
];
export const guidePartLabels: Record<GuidePart, string> = {
  experience: "Nuansa acara", agenda: "Jadwal", location: "Lokasi, rute & galeri", prepare: "Persiapan", contact: "Kontak",
};

const image = (): PlainImage => ({ url: "", alt: "", srcset: [] });
export const emptyGuide = (): GuideSettings => ({ cover: { eyebrow: "", title: "", subtitle: "", photo: image() }, chapters: [], order: [] });

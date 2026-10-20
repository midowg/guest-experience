import type { EnglishContent, EventRecord, TextPair } from "@/lib/types";
import type { Lang } from "./index";

type Field = Exclude<keyof EnglishContent, "agenda">;

/**
 * Every Indonesian text an admin can translate, with where its English version lives. The
 * editor lists these, and `localizeEvent` applies them, so the two never disagree.
 */
export const translatableFields: { key: Field; label: string; group: string; source: (event: EventRecord) => string; multiline?: boolean; max: number }[] = [
  { key: "title", label: "Judul acara", group: "Pembuka", source: e => e.title, max: 180 },
  { key: "subtitle", label: "Subjudul", group: "Pembuka", source: e => e.subtitle, max: 250 },
  { key: "greeting", label: "Sapaan", group: "Pembuka", source: e => e.greeting, max: 150 },
  { key: "introduction", label: "Isi undangan", group: "Pembuka", source: e => e.introduction, multiline: true, max: 5000 },
  { key: "closing", label: "Penutup", group: "Pembuka", source: e => e.closing, multiline: true, max: 2000 },
  { key: "experience_title", label: "Judul pengalaman", group: "Pengalaman kunjungan", source: e => e.experience.title, max: 200 },
  { key: "experience_story", label: "Cerita pengalaman", group: "Pengalaman kunjungan", source: e => e.experience.story, multiline: true, max: 2000 },
  { key: "arrival_notes", label: "Catatan kedatangan", group: "Lokasi", source: e => e.arrival_notes, multiline: true, max: 2000 },
  { key: "prepare_title", label: "Judul persiapan", group: "Persiapan tamu", source: e => e.prepare.title, max: 200 },
  { key: "prepare_intro", label: "Pengantar persiapan", group: "Persiapan tamu", source: e => e.prepare.intro, multiline: true, max: 1000 },
  { key: "day_note", label: "Catatan hari H", group: "Hari H", source: e => e.day_note, multiline: true, max: 1000 },
  { key: "contact_heading", label: "Judul kontak", group: "Kontak", source: e => e.contact.heading, max: 200 },
  { key: "contact_description", label: "Deskripsi kontak", group: "Kontak", source: e => e.contact.description, multiline: true, max: 1000 },
  { key: "feedback_description", label: "Pengantar survei", group: "Survei & ulasan", source: e => e.feedback_description, multiline: true, max: 1000 },
  { key: "review_heading", label: "Judul ulasan", group: "Survei & ulasan", source: e => e.review_heading, max: 200 },
  { key: "review_description", label: "Deskripsi ulasan", group: "Survei & ulasan", source: e => e.review_description, multiline: true, max: 1000 },
  { key: "review_button_label", label: "Teks tombol ulasan", group: "Survei & ulasan", source: e => e.review_button_label, max: 100 },
  { key: "after_title", label: "Judul terima kasih", group: "Setelah acara", source: e => e.after.title, max: 200 },
  { key: "after_message", label: "Pesan terima kasih", group: "Setelah acara", source: e => e.after.message, multiline: true, max: 2000 },
];

/** Indonesian texts that are filled in but have no English version yet. */
export function translationGaps(event: EventRecord): { total: number; missing: number } {
  const en = event.translations?.en;
  let total = 0, missing = 0;
  const check = (source: string, english: string | undefined) => { if (!source.trim()) return; total++; if (!english?.trim()) missing++; };
  for (const field of translatableFields) check(field.source(event), en?.[field.key]);
  const pair = (item: TextPair, english: TextPair | undefined) => { check(item.title, english?.title); check(item.description, english?.description); };
  event.topics.forEach(topic => pair(topic, topic.en));
  event.agenda.forEach(item => pair(item, en?.agenda[item.id]));
  event.experience.moments.forEach(moment => pair(moment, moment.en));
  event.prepare.items.forEach(item => { pair(item, item.en); if (item.list.length) check(item.list.join(""), item.en?.list.join("")); });
  return { total, missing };
}

/**
 * The event as an English reader sees it: each English text replaces its Indonesian source,
 * and an empty one leaves the Indonesian in place. `fallback` says whether that happened.
 */
export function localizeEvent(event: EventRecord, lang: Lang): { event: EventRecord; fallback: boolean } {
  if (lang === "id") return { event, fallback: false };
  const en = event.translations?.en;
  let fallback = false;
  const pick = (source: string, english: string | undefined) => {
    if (english?.trim()) return english;
    if (source.trim()) fallback = true;
    return source;
  };
  const pair = <T extends TextPair>(item: T, english: TextPair | undefined): T => ({ ...item, title: pick(item.title, english?.title), description: pick(item.description, english?.description) });
  return {
    event: {
      ...event,
      title: pick(event.title, en?.title), subtitle: pick(event.subtitle, en?.subtitle), greeting: pick(event.greeting, en?.greeting),
      introduction: pick(event.introduction, en?.introduction), closing: pick(event.closing, en?.closing),
      arrival_notes: pick(event.arrival_notes, en?.arrival_notes), day_note: pick(event.day_note, en?.day_note),
      feedback_description: pick(event.feedback_description, en?.feedback_description),
      review_heading: pick(event.review_heading, en?.review_heading), review_description: pick(event.review_description, en?.review_description),
      review_button_label: pick(event.review_button_label, en?.review_button_label),
      contact: { ...event.contact, heading: pick(event.contact.heading, en?.contact_heading), description: pick(event.contact.description, en?.contact_description) },
      topics: event.topics.map(topic => pair(topic, topic.en)),
      agenda: event.agenda.map(item => pair(item, en?.agenda[item.id])),
      experience: { ...event.experience, title: pick(event.experience.title, en?.experience_title), story: pick(event.experience.story, en?.experience_story), moments: event.experience.moments.map(moment => pair(moment, moment.en)) },
      prepare: {
        ...event.prepare, title: pick(event.prepare.title, en?.prepare_title), intro: pick(event.prepare.intro, en?.prepare_intro),
        items: event.prepare.items.map(item => {
          const english = item.en?.list.filter(line => line.trim()) ?? [];
          if (!english.length && item.list.length) fallback = true;
          return { ...pair(item, item.en), list: english.length ? english : item.list };
        }),
      },
      after: { ...event.after, title: pick(event.after.title, en?.after_title), message: pick(event.after.message, en?.after_message) },
    },
    fallback,
  };
}

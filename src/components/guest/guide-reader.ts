import { contactLink } from "./JourneyPanels";
import { venuePhotos } from "./Gallery";
import type { GuideChapter, GuidePart, GuideSettings } from "@/lib/guide";
import type { EventRecord } from "@/lib/types";
import type { Lang } from "@/lib/wording";

/*
 * The E-Guide reader's model, kept apart from its markup: which pages the book has, how a page
 * is named in the address (#bab-3), and the guide's texts in the language being read.
 */

/** One page of the book, in reading order. */
export type ReaderStep = { key: string; kind: "chapter"; chapter: GuideChapter } | { key: string; kind: "part"; part: GuidePart };
/** Where the reader is: the cover (with the table of contents), a page by index, or the closing page. */
export type ReaderView = { kind: "cover"; toc: boolean } | { kind: "step"; index: number } | { kind: "end" };

const pick = (source: string, english: string | undefined, missed: () => void) => {
  if (english?.trim()) return english;
  if (source.trim()) missed();
  return source;
};

/** The guide as an English reader sees it; an empty English text keeps the Indonesian. */
export function localizeGuide(guide: GuideSettings, lang: Lang): { guide: GuideSettings; fallback: boolean } {
  if (lang === "id") return { guide, fallback: false };
  let fallback = false;
  const missed = () => { fallback = true; };
  const { cover } = guide;
  return {
    guide: {
      ...guide,
      cover: { ...cover, eyebrow: pick(cover.eyebrow, cover.en?.eyebrow, missed), title: pick(cover.title, cover.en?.title, missed), subtitle: pick(cover.subtitle, cover.en?.subtitle, missed) },
      chapters: guide.chapters.map(chapter => ({
        ...chapter,
        title: pick(chapter.title, chapter.en?.title, missed),
        intro: pick(chapter.intro, chapter.en?.intro, missed),
        items: chapter.items.map(item => ({ ...item, title: pick(item.title, item.en?.title, missed), text: pick(item.text, item.en?.text, missed), fact: pick(item.fact, item.en?.fact, missed) })),
      })),
    },
    fallback,
  };
}

/** Whether a part of the event has anything to read; an empty one is left out of the book. */
export function partHasContent(event: EventRecord, part: GuidePart): boolean {
  switch (part) {
    case "experience": return !!(event.experience.story.trim() || event.experience.moments.length || event.experience.image.url);
    case "agenda": return event.agenda.length > 0;
    case "location": return !!(event.venue_name || event.address || event.location_url || event.location_embed_url || event.route.steps.length || event.route.map_image.url || venuePhotos(event).length);
    case "prepare": return event.prepare.items.length > 0;
    case "contact": {
      const emergency = event.emergency;
      return !!contactLink(event.contact) || !!(emergency && ((emergency.name && emergency.phone) || emergency.hospital));
    }
  }
}

/**
 * The pages in the admin's order: chapters with a title or items, parts with content, each once.
 * A guide whose order was never arranged reads its chapters as they were written.
 */
export function readerSteps(event: EventRecord, guide: GuideSettings): ReaderStep[] {
  const chapters = new Map(guide.chapters.map(chapter => [chapter.id, chapter]));
  const order = guide.order.length ? guide.order : guide.chapters.map(chapter => ({ kind: "chapter" as const, id: chapter.id }));
  const seen = new Set<string>();
  const steps: ReaderStep[] = [];
  for (const step of order) {
    const key = step.kind === "chapter" ? `chapter-${step.id}` : `part-${step.part}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (step.kind === "chapter") {
      const chapter = chapters.get(step.id);
      if (chapter && (chapter.title.trim() || chapter.items.length)) steps.push({ key, kind: "chapter", chapter });
    } else if (partHasContent(event, step.part)) steps.push({ key, kind: "part", part: step.part });
  }
  return steps;
}

export const TOC_HASH = "#daftar-isi";
export const END_HASH = "#selesai";

/** The address of a page: #bab-1 is the first page after the cover. */
export function hashFor(view: ReaderView): string {
  if (view.kind === "step") return `#bab-${view.index + 1}`;
  if (view.kind === "end") return END_HASH;
  return view.toc ? TOC_HASH : "";
}

/** Reads the address back; anything unknown or out of range opens the cover. */
export function viewFromHash(hash: string, total: number): ReaderView {
  const page = /^#bab-(\d+)$/.exec(hash);
  if (page) {
    const index = Number(page[1]) - 1;
    if (index >= 0 && index < total) return { kind: "step", index };
  }
  if (hash === END_HASH && total > 0) return { kind: "end" };
  return { kind: "cover", toc: hash === TOC_HASH };
}

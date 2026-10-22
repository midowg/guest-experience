import type { PhotoFrame, PlainImage } from "./types";

/**
 * Studio Poster: a poster template is a background (exported from Figma) plus boxes on top of
 * it, each one a text or a photo. Boxes are in design pixels, as Figma shows them, so the same
 * numbers hold on every screen: the whole poster scales, never the layout inside it.
 */
export const POSTER_LABEL = "Studio Poster";

export const posterFormats = ["post", "story"] as const;
export type PosterFormat = (typeof posterFormats)[number];
export const posterSizes: Record<PosterFormat, { width: number; height: number; label: string }> = {
  post: { width: 1080, height: 1350, label: "Post 4:5" },
  story: { width: 1080, height: 1920, label: "Story 9:16" },
};

/** Faces already bundled by the app (src/app/layout.tsx), with the weights loaded for each. */
export const posterFonts = {
  playfair: { family: "'Playfair Display', serif", label: "Playfair Display", weights: [400, 600] },
  nunito: { family: "'Nunito', sans-serif", label: "Nunito", weights: [400, 600, 700, 800] },
  lora: { family: "'Lora', serif", label: "Lora", weights: [400, 600] },
  cormorant: { family: "'Cormorant Garamond', serif", label: "Cormorant Garamond", weights: [500, 600] },
} as const;
export type PosterFont = keyof typeof posterFonts;

export type PosterBox = { x: number; y: number; w: number; h: number };
export type PosterField = {
  key: string; label: string; hint: string;
  kind: "text" | "photo";
  /** Set by the admin: whether the person making a poster may change this box. */
  editable: boolean;
  /** The admin's text: fixed when not editable, the starting text when it is. */
  value: string;
  maxLength: number;
  font: PosterFont; weight: number; color: string;
  align: "left" | "center" | "right"; uppercase: boolean;
  /** In em, as CSS letter-spacing. */
  letterSpacing: number;
  /** Largest and smallest font size in design pixels; long text shrinks between the two. */
  sizeMax: number; sizeMin: number;
  lineHeight: number; maxLines: number;
  /** Photo corners in design pixels, and the colour an empty photo box shows. */
  radius: number; fill: string;
  /** Where the box sits in each format; null when the format does not show it. */
  box: Record<PosterFormat, PosterBox | null>;
};
export type PosterFormatSetup = { enabled: boolean; background: PlainImage };
export type PosterSettings = {
  enabled: boolean;
  /** The preset the template came from; its built-in background shows until one is uploaded. */
  preset: string;
  formats: Record<PosterFormat, PosterFormatSetup>;
  fields: PosterField[];
};

/** What the person making a poster changed: text by field key, photos with their framing. */
export type PosterPhoto = { url: string; frame: PhotoFrame };
export type PosterValues = { text: Record<string, string>; photos: Record<string, PosterPhoto> };

const emptyImage = (): PlainImage => ({ url: "", alt: "", srcset: [] });
export function emptyPoster(): PosterSettings {
  return { enabled: false, preset: "", formats: { post: { enabled: true, background: emptyImage() }, story: { enabled: true, background: emptyImage() } }, fields: [] };
}

/** Fills what documents saved before Studio Poster existed do not carry. */
export function normalizePoster(poster: Partial<PosterSettings> | undefined): PosterSettings {
  const base = emptyPoster();
  if (!poster) return base;
  return {
    enabled: !!poster.enabled,
    preset: poster.preset ?? "",
    formats: {
      post: { ...base.formats.post, ...poster.formats?.post, background: { ...emptyImage(), ...poster.formats?.post?.background } },
      story: { ...base.formats.story, ...poster.formats?.story, background: { ...emptyImage(), ...poster.formats?.story?.background } },
    },
    fields: poster.fields ?? [],
  };
}

/** The text a box shows: the admin's when locked, the person's when they typed one. */
export function fieldText(field: PosterField, values: PosterValues): string {
  const own = values.text[field.key];
  return field.editable && own !== undefined ? own : field.value;
}

export type Measure = (text: string, size: number) => number;
export type FittedText = { size: number; lines: string[]; lineHeight: number; truncated: boolean };

/** Width of a line including CSS letter-spacing, which follows every character. */
export function spacedWidth(measure: Measure, text: string, size: number, letterSpacing: number) {
  return measure(text, size) + letterSpacing * size * [...text].length;
}

function wrap(text: string, fits: (line: string) => boolean): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (fits(next)) { line = next; continue; }
      if (line) lines.push(line);
      // A word wider than the box breaks between characters rather than spilling out.
      let rest = word;
      while (!fits(rest) && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && !fits(rest.slice(0, cut))) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * The largest size between sizeMax and sizeMin at which the text fits the box, and its lines. At
 * sizeMin a text that still does not fit keeps as many lines as fit and ends in "…". Screen and
 * download both draw these lines, so what is seen is what is saved.
 */
export function fitText(measure: Measure, raw: string, field: Pick<PosterField, "sizeMax" | "sizeMin" | "lineHeight" | "maxLines" | "letterSpacing" | "uppercase">, box: Pick<PosterBox, "w" | "h">): FittedText {
  const text = (field.uppercase ? raw.toLocaleUpperCase("id-ID") : raw).trim();
  const min = Math.max(1, Math.min(field.sizeMin, field.sizeMax));
  if (!text) return { size: field.sizeMax, lines: [], lineHeight: field.lineHeight, truncated: false };
  for (let size = Math.max(min, field.sizeMax); size >= min; size--) {
    const fits = (line: string) => spacedWidth(measure, line, size, field.letterSpacing) <= box.w;
    const lines = wrap(text, fits);
    const room = Math.max(1, Math.min(field.maxLines, Math.floor(box.h / (size * field.lineHeight) + 0.001)));
    if (lines.length <= room) return { size, lines, lineHeight: field.lineHeight, truncated: false };
    if (size === min) {
      const kept = lines.slice(0, room);
      let last = kept[room - 1];
      while (last && !fits(`${last}…`)) last = last.slice(0, -1).trimEnd();
      kept[room - 1] = `${last}…`;
      return { size, lines: kept, lineHeight: field.lineHeight, truncated: true };
    }
  }
  return { size: min, lines: [text], lineHeight: field.lineHeight, truncated: true };
}

/** Where a framed photo lands in its box: the same maths as the hero framing (x, y in %). */
export function photoPlacement(box: Pick<PosterBox, "w" | "h">, natural: { width: number; height: number }, frame: PhotoFrame) {
  const scale = Math.max(box.w / natural.width, box.h / natural.height) * frame.zoom;
  const width = natural.width * scale, height = natural.height * scale;
  return { width, height, left: (box.w - width) * frame.x / 100, top: (box.h - height) * frame.y / 100 };
}

/** Indonesian day and date, "Sabtu, 7 November 2026", in the event's own zone. */
export function posterDate(iso: string, timezone: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("id-ID", { weekday: "long", timeZone: timezone }).format(date);
  const rest = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: timezone }).format(date);
  return `${day}, ${rest}`;
}
/** "11.30 WIB". */
export function posterTime(iso: string, timezone: string, zoneLabel: string): string {
  if (!iso) return "";
  const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(new Date(iso)).replace(":", ".");
  return `${time} ${zoneLabel}`.trim();
}
/** "Durasi 60 menit", or "" when the event has no end. */
export function posterDuration(starts: string, ends: string | null): string {
  if (!starts || !ends) return "";
  const minutes = Math.round((new Date(ends).getTime() - new Date(starts).getTime()) / 60000);
  return minutes > 0 ? `Durasi ${minutes} menit` : "";
}

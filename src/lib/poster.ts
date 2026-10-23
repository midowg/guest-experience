import type { PhotoFrame, PlainImage } from "./types";

/**
 * Studio Poster: a poster template is a background (exported from Figma) plus boxes on top of
 * it, each one a text or a photo. Boxes are in design pixels, as Figma shows them, so the same
 * numbers hold on every screen: the whole poster scales, never the layout inside it.
 */
export const POSTER_LABEL = "Studio Poster";

export const posterFormats = ["post", "story", "square", "landscape", "a4", "a4_landscape", "a5", "idcard"] as const;
export type PosterFormat = (typeof posterFormats)[number];
/**
 * Design sizes in pixels, and for the ones meant for paper the page a PDF gets (points, 1/72 in):
 * A4 and A5 at 150 dpi, the ID card at 300 dpi (CR80, 54 x 85.6 mm).
 */
export const posterSizes: Record<PosterFormat, { width: number; height: number; label: string; group: "digital" | "print"; page?: [number, number] }> = {
  post: { width: 1080, height: 1350, label: "Post 4:5", group: "digital" },
  story: { width: 1080, height: 1920, label: "Story 9:16", group: "digital" },
  square: { width: 1080, height: 1080, label: "Persegi 1:1", group: "digital" },
  landscape: { width: 1920, height: 1080, label: "Landscape 16:9", group: "digital" },
  a4: { width: 1240, height: 1754, label: "A4", group: "print", page: [595.28, 841.89] },
  a4_landscape: { width: 1754, height: 1240, label: "A4 landscape", group: "print", page: [841.89, 595.28] },
  a5: { width: 874, height: 1240, label: "A5", group: "print", page: [419.53, 595.28] },
  idcard: { width: 638, height: 1011, label: "ID card", group: "print", page: [153.07, 242.65] },
};

/** A PDF page in points: the real paper for print sizes, otherwise half a point per design pixel. */
export const pdfPage = (format: PosterFormat): [number, number] => posterSizes[format].page ?? [posterSizes[format].width / 2, posterSizes[format].height / 2];

/** What a card is for; each kind has its own ready-made designs. */
export const cardTypes = [
  { key: "poster", label: "Poster sesi", description: "Poster acara atau sesi untuk dibagikan di media sosial." },
  { key: "ucapan", label: "Kartu ucapan", description: "Ucapan selamat, terima kasih, atau hari raya." },
  { key: "idcard", label: "ID card / name tag", description: "Kartu nama peserta, panitia, atau pembicara." },
  { key: "sertifikat", label: "Sertifikat", description: "Sertifikat peserta atau penghargaan, siap cetak." },
  { key: "undangan", label: "Kartu undangan", description: "Undangan singkat bergambar untuk dikirim." },
] as const;
export type CardType = (typeof cardTypes)[number]["key"];

/**
 * A colour set a design is drawn with. Boxes name a role (tone) instead of a colour, so one design
 * works in every palette; the background is drawn from the same roles.
 */
export const paletteRoles = ["background", "surface", "primary", "onPrimary", "accent", "text", "muted", "line", "photo"] as const;
export type PaletteRole = (typeof paletteRoles)[number];
export type PosterPalette = { key: string; name: string; colors: Record<PaletteRole, string> };
export const posterPalettes: PosterPalette[] = [
  { key: "rempah", name: "Rempah", colors: { background: "#fbf7ef", surface: "#f3ead8", primary: "#0f4a3a", onPrimary: "#fbf7ef", accent: "#c9922b", text: "#1f2a24", muted: "#5d6157", line: "#e3cfa3", photo: "#e9dfcb" } },
  { key: "werkudara", name: "Werkudara", colors: { background: "#ffffff", surface: "#eef6fb", primary: "#1551a0", onPrimary: "#ffffff", accent: "#3fa9dd", text: "#1f2937", muted: "#5b6476", line: "#c3e6f5", photo: "#dbe9f6" } },
  { key: "malam", name: "Malam emas", colors: { background: "#111a2e", surface: "#1b2742", primary: "#c9a35b", onPrimary: "#111a2e", accent: "#e9d6a8", text: "#f4efe3", muted: "#b4bbcc", line: "#2c3a5a", photo: "#1b2742" } },
  { key: "segar", name: "Segar", colors: { background: "#ffffff", surface: "#eaf6ef", primary: "#22684a", onPrimary: "#ffffff", accent: "#e8952b", text: "#1f2a24", muted: "#56625b", line: "#cfe7d9", photo: "#d9efe3" } },
  { key: "senja", name: "Senja", colors: { background: "#fdf4ec", surface: "#f6e3d3", primary: "#9c3d22", onPrimary: "#fff7f0", accent: "#d98a3d", text: "#2d1d16", muted: "#6f5a4e", line: "#ecd0bb", photo: "#ecd8c6" } },
];
export const paletteOf = (key: string | undefined) => posterPalettes.find(palette => palette.key === key) ?? posterPalettes[0];

/** Faces already bundled by the app (src/app/layout.tsx), with the weights loaded for each. */
export const posterFonts = {
  playfair: { family: "'Playfair Display', serif", label: "Playfair Display", weights: [400, 600] },
  nunito: { family: "'Nunito', sans-serif", label: "Nunito", weights: [400, 600, 700, 800] },
  inter: { family: "'Inter', sans-serif", label: "Inter", weights: [400, 500, 600, 700] },
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
  font: PosterFont; weight: number;
  /** The palette role the text is drawn in; "" uses `color` as is. */
  tone: PaletteRole | ""; color: string;
  align: "left" | "center" | "right"; uppercase: boolean;
  /** In em, as CSS letter-spacing. */
  letterSpacing: number;
  /** Largest and smallest font size in design pixels; long text shrinks between the two. */
  sizeMax: number; sizeMin: number;
  lineHeight: number; maxLines: number;
  /** Photo corners in design pixels (half the box for a circle), and the colour an empty photo box shows. */
  radius: number; fill: string;
  /** May be left empty: its slot (the box, the frame, a plate behind it) is then left out of the card. */
  optional?: boolean;
  /** A list of points: one per line of the text, each drawn after a bullet. */
  list?: boolean;
  /** The type in a size whose design sets it larger or smaller, as a factor of sizeMax/sizeMin. */
  sizes?: Partial<Record<PosterFormat, number>>;
  /**
   * A stack (like Figma's auto layout) the box stands in, by name: its boxes go one under another
   * in design order; an empty one leaves together with its heading, and the ones below move up.
   */
  stack?: string;
  /** Per size: where the item's own design sits (its heading, a divider above it), drawn from its part's `label`. */
  labelBox?: Partial<Record<PosterFormat, PosterBox>>;
  /** Where the box sits in each format; null when the format does not show it. */
  box: Record<PosterFormat, PosterBox | null>;
};
/**
 * A box's own pictures from Figma, drawn at the size of the card: `art` is the "upload a photo"
 * icon and label inside a photo box, shown only while it is empty and only on screen; `slot` is
 * an optional box's frame or plate, shown only when the box is filled; `label` is a stacked item's
 * heading and divider (see PosterField.stack), moved with it and left out with it.
 */
export type PosterPart = { key: string; art: PlainImage; slot: PlainImage; label?: PlainImage };
/**
 * A size's images: the background, under everything, and an overlay drawn over the photos and
 * under the text: what lies on top of a photo in Figma (a ribbon, a frame) stays on top of it.
 */
export type PosterFormatSetup = { enabled: boolean; background: PlainImage; overlay: PlainImage; parts: PosterPart[] };
export type PosterSettings = {
  enabled: boolean;
  /** What the card is for, and the preset it came from (its background shows until one is uploaded). */
  cardType: CardType;
  preset: string;
  /** The palette, and whether the person making a card may pick another one. */
  palette: string; paletteChoice: boolean;
  formats: Record<PosterFormat, PosterFormatSetup>;
  fields: PosterField[];
};

/**
 * A poster saved to the super admin's library (migration 202610220002): an event starts from a
 * copy of it, so a later change to the design never moves an event's boxes.
 */
export type PosterDesign = { id: string; name: string; description: string; template: Pick<PosterSettings, "preset" | "formats" | "fields"> & Partial<Pick<PosterSettings, "cardType" | "palette" | "paletteChoice">>; created_at: string };

/** What the person making a poster changed: text by field key, photos with their framing. */
export type PosterPhoto = { url: string; frame: PhotoFrame };
export type PosterValues = { text: Record<string, string>; photos: Record<string, PosterPhoto>; palette?: string };

const emptyImage = (): PlainImage => ({ url: "", alt: "", srcset: [] });
const formatSetups = (enabled: readonly PosterFormat[]) => Object.fromEntries(posterFormats.map(format => [format, { enabled: enabled.includes(format), background: emptyImage(), overlay: emptyImage(), parts: [] as PosterPart[] }])) as Record<PosterFormat, PosterFormatSetup>;
export function emptyPoster(): PosterSettings {
  return { enabled: false, cardType: "poster", preset: "", palette: "rempah", paletteChoice: false, formats: formatSetups(["post", "story"]), fields: [] };
}
/** Every format, with the given ones switched on. */
export const posterFormatSetups = formatSetups;
/** A box per format from a partial map: formats left out do not show the box. */
export const boxes = (map: Partial<Record<PosterFormat, PosterBox | null>>) => Object.fromEntries(posterFormats.map(format => [format, map[format] ?? null])) as Record<PosterFormat, PosterBox | null>;

/** Fills what documents saved before Studio Poster existed do not carry. */
export function normalizePoster(poster: Partial<PosterSettings> | undefined): PosterSettings {
  const base = emptyPoster();
  if (!poster) return base;
  const saved = (poster.formats ?? {}) as Partial<Record<PosterFormat, Partial<PosterFormatSetup>>>;
  return {
    enabled: !!poster.enabled,
    cardType: poster.cardType ?? "poster",
    preset: poster.preset ?? "",
    palette: poster.palette ?? "rempah",
    paletteChoice: !!poster.paletteChoice,
    // Saved before more sizes existed: the new ones are off.
    formats: Object.fromEntries(posterFormats.map(format => [format, { enabled: saved[format]?.enabled ?? (poster.formats ? false : base.formats[format].enabled), background: { ...emptyImage(), ...saved[format]?.background }, overlay: { ...emptyImage(), ...saved[format]?.overlay }, parts: saved[format]?.parts ?? [] }])) as Record<PosterFormat, PosterFormatSetup>,
    fields: (poster.fields ?? []).map(field => ({ ...field, tone: field.tone ?? "", box: boxes(field.box ?? {}) })),
  };
}

/** The text a box shows: the admin's when locked, the person's when they typed one. */
/** The palette in use: the person's pick when the admin lets them choose, else the admin's. */
export function activePalette(poster: Pick<PosterSettings, "palette" | "paletteChoice">, values?: Pick<PosterValues, "palette">): PosterPalette {
  return paletteOf(poster.paletteChoice && values?.palette ? values.palette : poster.palette);
}
/** A box's colour: its palette role when it has one, else its own colour. */
/**
 * Whether a box's slot (its frame or plate) shows: always for a box that must be filled, and for
 * an optional one only once it is filled, or on screen while it still shows its hint.
 */
export const slotShows = (field: PosterField, values: PosterValues, hints: boolean) =>
  // A photo replaces its placeholder box once uploaded (a transparent PNG must not show it through).
  field.kind === "photo" ? !values.photos[field.key] && (!field.optional || hints) : !field.optional || hints || !!fieldText(field, values).trim();
/** A size's pictures for one box (see PosterPart), if the design has them. */
export const partOf = (poster: PosterSettings, format: PosterFormat, key: string) => poster.formats[format].parts?.find(part => part.key === key);

export const toneColor = (field: Pick<PosterField, "tone" | "color">, palette: PosterPalette) => field.tone ? palette.colors[field.tone] : field.color;

export function fieldText(field: PosterField, values: PosterValues): string {
  const own = values.text[field.key];
  return field.editable && own !== undefined ? own : field.value;
}

export type Measure = (text: string, size: number) => number;
/**
 * `indents` (list fields only) is each line's left offset in design pixels at `size`: a point's
 * continuation lines start after its bullet. The line is then aligned in what is left of the box.
 */
export type FittedText = { size: number; lines: string[]; lineHeight: number; truncated: boolean; indents?: number[] };

/** What a list point starts with. */
export const BULLET = "• ";

/** Width of a line including CSS letter-spacing, which follows every character. */
export function spacedWidth(measure: Measure, text: string, size: number, letterSpacing: number) {
  return measure(text, size) + letterSpacing * size * [...text].length;
}

/** One paragraph (no line breaks) broken into lines that each pass `fits`. */
function wrap(paragraph: string, fits: (line: string) => boolean): string[] {
  const lines: string[] = [];
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
  if (line) lines.push(line);
  return lines;
}

/**
 * The largest size between sizeMax and sizeMin at which the text fits the box, and its lines. At
 * sizeMin a text that still does not fit keeps as many lines as fit and ends in "…". Screen and
 * download both draw these lines, so what is seen is what is saved. Typed line breaks are kept
 * (blank lines dropped); in a list field each line is a point after a bullet, wrapping under its
 * own text rather than under the bullet.
 */
export function fitText(measure: Measure, raw: string, field: Pick<PosterField, "sizeMax" | "sizeMin" | "lineHeight" | "maxLines" | "letterSpacing" | "uppercase" | "list">, box: Pick<PosterBox, "w" | "h">): FittedText {
  const text = (field.uppercase ? raw.toLocaleUpperCase("id-ID") : raw).trim();
  // A bullet typed by hand would be drawn twice.
  const paragraphs = text.split("\n").map(line => (field.list ? line.replace(/^\s*[•·*-]\s+/, "") : line).trim()).filter(Boolean);
  const min = Math.max(1, Math.min(field.sizeMin, field.sizeMax));
  if (!paragraphs.length) return { size: field.sizeMax, lines: [], lineHeight: field.lineHeight, truncated: false };
  const done = (size: number, laid: { text: string; indent: number }[], truncated: boolean): FittedText => ({ size, lines: laid.map(line => line.text), lineHeight: field.lineHeight, truncated, ...(field.list ? { indents: laid.map(line => line.indent) } : {}) });
  for (let size = Math.max(min, field.sizeMax); size >= min; size--) {
    const fits = (line: string, width: number) => spacedWidth(measure, line, size, field.letterSpacing) <= width;
    const bullet = field.list ? spacedWidth(measure, BULLET, size, field.letterSpacing) : 0;
    const laid = paragraphs.flatMap(paragraph => field.list
      ? wrap(paragraph, line => fits(line, box.w - bullet)).map((line, index) => index ? { text: line, indent: bullet } : { text: `${BULLET}${line}`, indent: 0 })
      : wrap(paragraph, line => fits(line, box.w)).map(line => ({ text: line, indent: 0 })));
    const room = Math.max(1, Math.min(field.maxLines, Math.floor(box.h / (size * field.lineHeight) + 0.001)));
    if (laid.length <= room) return done(size, laid, false);
    if (size === min) {
      const kept = laid.slice(0, room), end = kept[room - 1];
      let last = end.text;
      while (last && !fits(`${last}…`, box.w - end.indent)) last = last.slice(0, -1).trimEnd();
      kept[room - 1] = { ...end, text: `${last}…` };
      return done(size, kept, true);
    }
  }
  return done(min, [{ text, indent: 0 }], true);
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

import { fieldText, fitText, posterFonts, type FittedText, type Measure, type PosterField, type PosterFormat, type PosterPalette, type PosterSettings, type PosterValues } from "@/lib/poster";
import { presetBackground, presetOf } from "@/lib/poster-presets";

/** The CSS/canvas font shorthand of a field at a size. */
export const fontOf = (field: Pick<PosterField, "font" | "weight">, size: number) => `${field.weight} ${size}px ${posterFonts[field.font].family}`;

let measuring: CanvasRenderingContext2D | null | undefined;
/** Text width from the browser's own font engine, the one both screen and download use. */
export function createMeasure(field: Pick<PosterField, "font" | "weight">): Measure {
  if (measuring === undefined) measuring = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  const context = measuring;
  // No canvas (tests, very old browsers): a rough average width keeps the layout sensible.
  if (!context) return (text, size) => [...text].length * size * 0.55;
  return (text, size) => { context.font = fontOf(field, size); return context.measureText(text).width; };
}

/** Resolves once every face the poster uses is loaded, so measuring is right the first time. */
export async function loadPosterFonts(fields: PosterField[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  const faces = new Set(fields.filter(field => field.kind === "text").map(field => fontOf(field, 32)));
  await Promise.all([...faces].map(face => document.fonts.load(face).catch(() => [])));
}

/**
 * The background a format shows: the one uploaded from Figma, else the preset's own drawn in the
 * palette (an SVG data address, so it stays same-origin and the download canvas may read it).
 */
export function posterBackground(poster: PosterSettings, format: PosterFormat, palette: PosterPalette): string {
  if (poster.formats[format].background.url) return poster.formats[format].background.url;
  const svg = presetBackground(presetOf(poster.preset), format, palette);
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : "";
}

export type LaidText = { field: PosterField; text: string; fitted: FittedText; hint: boolean };

/**
 * Every text box of a format with its lines. An empty editable box shows its hint (`hints`: before
 * the first save and while editing) and nothing in the download; a box the format does not place
 * is left out.
 */
export function layoutTexts(poster: PosterSettings, values: PosterValues, format: PosterFormat, hints: boolean): LaidText[] {
  const laid: LaidText[] = [];
  for (const field of poster.fields) {
    const box = field.box[format];
    if (field.kind !== "text" || !box) continue;
    const own = fieldText(field, values).trim();
    const hint = !own && hints && field.editable;
    const text = own || (hint ? field.hint : "");
    if (!text) continue;
    // A one-line hint is an instruction, not a point: only a hint written as lines gets bullets.
    const plain = hint && field.list && !text.includes("\n") ? { ...field, list: false } : field;
    // Another size's design may set the type larger or smaller than the first one did.
    const factor = field.sizes?.[format] ?? 1;
    const style = factor === 1 ? plain : { ...plain, sizeMax: Math.round(field.sizeMax * factor), sizeMin: Math.max(6, Math.round(field.sizeMin * factor)) };
    laid.push({ field, text, hint, fitted: fitText(createMeasure(field), text, style, box) });
  }
  return laid;
}

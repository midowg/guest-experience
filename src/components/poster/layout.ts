import { fieldText, fitText, posterFonts, type FittedText, type Measure, type PosterField, type PosterFormat, type PosterSettings, type PosterValues } from "@/lib/poster";
import { presetOf } from "@/lib/poster-presets";

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

/** The background a format shows: the uploaded one, else the preset's own. */
export function posterBackground(poster: PosterSettings, format: PosterFormat): string {
  return poster.formats[format].background.url || presetOf(poster.preset)?.backgrounds[format] || "";
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
    laid.push({ field, text, hint, fitted: fitText(createMeasure(field), text, field, box) });
  }
  return laid;
}

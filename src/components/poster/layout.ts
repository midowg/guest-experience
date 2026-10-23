import { fieldText, fitText, posterFonts, type FittedText, type Measure, type PosterBox, type PosterField, type PosterFormat, type PosterPalette, type PosterSettings, type PosterValues } from "@/lib/poster";
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

/**
 * `box` is where the lines are drawn: the design's box, or for a stacked item (PosterField.stack)
 * the box moved up or down the stack, as tall as its stack lets it grow. `labelShift` moves that
 * item's own heading and divider (its part's `label`, cropped to `labelShift.box`) by the same
 * `dy`; an item left out is not laid at all, so its heading is not drawn either.
 */
export type LaidText = { field: PosterField; text: string; fitted: FittedText; hint: boolean; box: PosterBox; labelShift?: { box: PosterBox; dy: number } };

/** What a box shows: the person's or admin's text, else its hint while hints show. */
function shownText(field: PosterField, values: PosterValues, hints: boolean) {
  const own = fieldText(field, values).trim();
  const hint = !own && hints && field.editable;
  return { text: own || (hint ? field.hint : ""), hint };
}

/** The type a box is fitted with in a format. */
function styleOf(field: PosterField, format: PosterFormat, text: string, hint: boolean) {
  // A one-line hint is an instruction, not a point: only a hint written as lines gets bullets.
  const plain = hint && field.list && !text.includes("\n") ? { ...field, list: false } : field;
  // Another size's design may set the type larger or smaller than the first one did.
  const factor = field.sizes?.[format] ?? 1;
  return factor === 1 ? plain : { ...plain, sizeMax: Math.round(field.sizeMax * factor), sizeMin: Math.max(6, Math.round(field.sizeMin * factor)) };
}

/**
 * The stacks of a format laid like Figma's auto layout: items one under another in design order,
 * each as tall as its lines, the design's gaps kept between them. An empty item leaves with its
 * heading and the ones below move up; a longer one pushes them down, never past the stack's bottom.
 */
function layoutStacks(poster: PosterSettings, values: PosterValues, format: PosterFormat, hints: boolean): Map<string, LaidText> {
  const laid = new Map<string, LaidText>();
  const top = (field: PosterField) => field.labelBox?.[format]?.y ?? field.box[format]!.y;
  const names = new Set(poster.fields.flatMap(field => field.kind === "text" && field.stack && field.box[format] ? [field.stack] : []));
  for (const name of names) {
    const members = poster.fields.filter(field => field.kind === "text" && field.stack === name && field.box[format]).sort((a, b) => top(a) - top(b));
    const bottom = Math.max(...members.map(field => field.box[format]!.y + field.box[format]!.h));
    let cursor = top(members[0]);
    members.forEach((field, index) => {
      // On screen an empty item still shows its heading and hint, so the person sees what can be
      // filled; only the download leaves it out (hints off), the ones below moving up.
      const { text, hint } = shownText(field, values, hints);
      if (!text) return;
      const design = field.box[format]!, dy = cursor - top(field), y = design.y + dy;
      const style = styleOf(field, format, text, hint);
      // Room for every line it may have at full size, but not far below the last item's design;
      // pushed down by longer items above, an item keeps at least one line rather than vanish.
      const line = style.sizeMax * style.lineHeight;
      const box = { ...design, y, h: Math.max(line, Math.min(style.maxLines * line, bottom + line * 2 - y)) };
      const fitted = fitText(createMeasure(field), text, style, box);
      const next = members[index + 1];
      cursor = y + fitted.lines.length * fitted.size * fitted.lineHeight + (next ? Math.max(0, top(next) - (design.y + design.h)) : 0);
      const label = field.labelBox?.[format];
      laid.set(field.key, { field, text, hint, fitted, box, ...(label ? { labelShift: { box: label, dy } } : {}) });
    });
  }
  return laid;
}

/**
 * Every text box of a format with its lines. An empty editable box shows its hint (`hints`: before
 * the first save and while editing) and nothing in the download; a box the format does not place
 * is left out. Stacked boxes move with their stack (layoutStacks).
 */
export function layoutTexts(poster: PosterSettings, values: PosterValues, format: PosterFormat, hints: boolean): LaidText[] {
  const stacked = layoutStacks(poster, values, format, hints);
  const laid: LaidText[] = [];
  for (const field of poster.fields) {
    const box = field.box[format];
    if (field.kind !== "text" || !box) continue;
    if (field.stack) { const item = stacked.get(field.key); if (item) laid.push(item); continue; }
    const { text, hint } = shownText(field, values, hints);
    if (!text) continue;
    laid.push({ field, text, hint, box, fitted: fitText(createMeasure(field), text, styleOf(field, format, text, hint), box) });
  }
  return laid;
}

import { boxes, posterFonts, posterFormats, posterSizes, type PosterBox, type PosterField, type PosterFont, type PosterFormat } from "@/lib/poster";

/**
 * A card design straight from Figma. The designer names the layers guests may change
 * `isi_<name>` (text) or `foto_<name>` (photo) and exports the frame as SVG with "Include id"
 * (and best "Outline text"). Here the SVG becomes the card: those layers become boxes (position,
 * size, type style), the rest becomes the background. Nothing but the background image is
 * uploaded; the SVG itself is not kept.
 */

const LAYER = /^(isi|foto)[-_](.+?)(?:_\d+)?$/i;
/** A group of items standing one under another, like Figma's auto layout: `susun_info`. */
const STACK = /^susun[-_](.+?)(?:_\d+)?$/i;
const ROUND = 500;

/** A stack's name as a key ("Info 2" → "info_2"); null when nothing is left of it. */
const stackKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || null;
/** `susun_info` → "info": the stack its isi_ layers stand in. */
export function parseStack(id: string): string | null {
  const match = STACK.exec(id.trim());
  return match ? stackKey(match[1]) : null;
}

/** An SVG without isi_/foto_ layers: the admin marks the parts by hand instead (FigmaMarker). */
export class NoLayersError extends Error {}

/** The shapes a design is drawn with: what the admin can tap, and what can lie over a photo. */
export const SHAPES = "path, rect, circle, ellipse, line, polyline, polygon, image, use, text";

/**
 * The SVG with anything that could run taken out (scripts, foreignObject, on… handlers,
 * javascript: links), before it is shown in the admin or measured. A design needs none of it.
 */
export function sanitizeSvg(source: string): string {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (doc.documentElement.tagName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) return source;
  for (const element of [...doc.querySelectorAll("script, foreignObject")]) element.remove();
  for (const element of doc.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name.endsWith(":href")) && /^\s*javascript:/i.test(attribute.value))) element.removeAttribute(attribute.name);
    }
  }
  return new XMLSerializer().serializeToString(doc);
}

const SVG_NS = "http://www.w3.org/2000/svg";
/** Shapes that are boxes rather than glyphs: tapped as text, they hold the text. */
const BOXES = ["rect", "circle", "ellipse", "image"];
/** How light a colour is, 0 (black) to 1 (white); unknown colours count as light. */
function luminance(colour: string): number {
  const value = hex(colour);
  if (!value) return 1;
  const [r, g, b] = [1, 3, 5].map(at => Number.parseInt(value.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * About how many letters fit in a text box at its largest size: an average letter is about half
 * an em wide (wider in capitals and with spacing), rounded up to tens.
 */
export function capacity(field: Pick<PosterField, "sizeMax" | "maxLines" | "uppercase" | "letterSpacing">, box: Pick<PosterBox, "w">): number {
  const letter = field.sizeMax * ((field.uppercase ? 0.62 : 0.5) + Math.max(0, field.letterSpacing));
  const letters = Math.floor(box.w / Math.max(1, letter)) * Math.max(1, field.maxLines);
  return Math.min(1000, Math.max(20, Math.ceil(letters / 10) * 10));
}

/**
 * How many lines an outlined text has, from where its letters start: Figma starts each glyph
 * with a move (M x y), and a new line shows as a clear jump in y between groups of letters.
 * Gaps smaller than 6 units, or groups of letters thinner than 4 units and than half a jump,
 * are a single line's letters.
 */
export function guessLines(element: Element): number {
  // The thresholds are for a frame 1080 units wide; an A4 frame in points (596) has smaller units.
  const view = (element.closest("svg")?.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const unit = view.length === 4 && view[2] > 0 ? Math.min(3, Math.max(0.3, view[2] / 1080)) : 1;
  const paths = element.matches("path") ? [element] : [...element.querySelectorAll("path")];
  const ys = paths.flatMap(path => [...(path.getAttribute("d") ?? "").matchAll(/M\s*-?[\d.]+[\s,]+(-?[\d.]+)/g)].map(match => Number(match[1]))).sort((a, b) => a - b);
  if (ys.length < 6) return 1;
  const gaps = ys.slice(1).map((y, index) => y - ys[index]);
  const widest = Math.max(...gaps);
  const breaks = gaps.filter(gap => gap > Math.max(6 * unit, widest * 0.6));
  if (!breaks.length) return 1;
  const lines = breaks.length + 1;
  const spread = ys[ys.length - 1] - ys[0] - breaks.reduce((sum, gap) => sum + gap, 0);
  return spread / lines < Math.min(4 * unit, Math.min(...breaks) * 0.5) ? 1 : Math.min(8, lines);
}

/** A box in the root SVG's own units (its viewBox). */
export type Area = { x: number; y: number; w: number; h: number };
/**
 * A part the admin tapped: its place among the SVG's elements, and what it becomes. `key`: the
 * field of another size's design it fills, so both sizes share one form. A list (`list`) is
 * several shapes (`index` and `extra`: each bullet line and its icon) that become one text box
 * over `area`. `stack`: the stack a text stands in (see PosterField.stack); its heading and a
 * divider above it are found by the import, not tapped.
 */
export type Mark = { index: number; kind: "text" | "photo"; label: string; lines: number; font: "sans" | "serif"; optional?: boolean; key?: string; list?: boolean; extra?: number[]; area?: Area; stack?: string };

/** A key from a label: "Nama fasilitator" → "nama_fasilitator". */
export const keyOf = (label: string) => label.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 34) || "kolom";

/**
 * The SVG with the tapped parts named as if the designer had done it in Figma (isi_…/foto_…,
 * with the lines and face as hints), so the usual import reads it. `index` counts elements in
 * document order, as `querySelectorAll("*")` lists them.
 */
export function nameMarks(source: string, marks: Mark[]): string {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const all = [...doc.documentElement.querySelectorAll("*")];
  const used = new Set<string>();
  for (const mark of marks) {
    const element = all[mark.index];
    if (!element || (mark.list && !mark.area)) continue;
    // A photo labelled "Foto utama" is foto_utama, not foto_foto_utama. Numbers go without "_"
    // ("Teks 2" is teks2): Figma's "_2" on duplicates is read as the same layer. A key taken from
    // another size's field is kept as it is, so mergeImport joins the two.
    const strip = (key: string) => mark.kind === "photo" ? key.replace(/^foto_/, "") || "foto" : key;
    const base = mark.key ? strip(mark.key) : strip(keyOf(mark.label)).replace(/_(\d+)$/, "$1");
    let key = base, n = 2;
    while (used.has(`${mark.kind}:${key}`)) key = `${base}${n++}`;
    used.add(`${mark.kind}:${key}`);
    // A key ending in _1 (teks_1) keeps it only with something after: parseLayer reads a last _n as Figma's duplicate count.
    const id = `${mark.kind === "photo" ? "foto" : "isi"}_${key}${mark.optional ? "_opsional" : /_\d+$/.test(key) ? "_1" : ""}`;
    if (mark.list && mark.area) {
      // The lines and icons stay where they are only to be cut out (data-isi-bagian); a group
      // with a clear box over them all is the list's area.
      for (const index of [mark.index, ...(mark.extra ?? [])]) all[index]?.setAttribute("data-isi-bagian", parseLayer(id)?.key ?? key);
      const group = doc.createElementNS(SVG_NS, "g"), box = doc.createElementNS(SVG_NS, "rect");
      for (const [name, value] of [["x", mark.area.x], ["y", mark.area.y], ["width", mark.area.w], ["height", mark.area.h]] as const) box.setAttribute(name, String(Math.round(value * 10) / 10));
      box.setAttribute("fill", "none");
      group.append(box);
      for (const [name, value] of [["id", id], ["data-list", "true"], ["data-lines", String(mark.lines)], ["data-font", mark.font === "serif" ? "cormorant" : "inter"], ["data-hint", mark.label], ["data-label", mark.label]]) group.setAttribute(name, value);
      doc.documentElement.append(group);
      continue;
    }
    // A box marked as text (a ribbon, a label plate) stays in the design and becomes the text's
    // area: it goes into a group named for the text, with a clear twin as the area and a colour
    // that reads on it. The import keeps the plate as background, or as the slot when optional.
    const onPlate = mark.kind === "text" && BOXES.includes(element.tagName.toLowerCase());
    const named = onPlate ? doc.createElementNS(SVG_NS, "g") : element;
    if (onPlate) {
      const twin = element.cloneNode(false) as Element;
      for (const name of ["id", "fill", "stroke", "filter", "opacity", "href", "xlink:href"]) twin.removeAttribute(name);
      twin.setAttribute("fill", "none");
      element.before(named);
      named.append(element, twin);
      named.setAttribute("data-color", luminance(inherited(element, "fill")) < 0.5 ? "#FFFFFF" : "#1F2A24");
    }
    named.setAttribute("id", id);
    named.setAttribute("data-label", mark.label);
    const stack = mark.kind === "text" && mark.stack ? stackKey(mark.stack) : null;
    if (stack) named.setAttribute("data-susun", stack);
    // A live <text> brings its own face, size and lines; only outlined text needs them told.
    if (mark.kind === "text") {
      named.setAttribute("data-hint", mark.label);
      if (element.tagName.toLowerCase() !== "text") {
        named.setAttribute("data-lines", String(mark.lines));
        named.setAttribute("data-font", mark.font === "serif" ? "cormorant" : "inter");
      }
    }
  }
  return new XMLSerializer().serializeToString(doc);
}

/** `optional`: the layer's name ends in _opsional, so the box may be left empty. */
export type Placeholder = { id: string; kind: "text" | "photo"; key: string; label: string; optional: boolean };
/** A box's own pictures as SVG (see PosterPart): null when the design has none. */
export type FigmaPart = { key: string; art: string | null; slot: string | null; label: string | null };
export type Measured = { box: PosterBox; element: Element };
export type FigmaImport = {
  format: PosterFormat;
  /** The SVG with the text layers taken out, sized to the format: drawn as the background. */
  background: string;
  /** What lies on top of a photo in Figma (a ribbon over the picture), drawn over the guest's photo; null when nothing does. */
  overlay: string | null;
  /** Per box: the "upload a photo" marks, and an optional box's frame or plate. */
  parts: FigmaPart[];
  fields: PosterField[];
  notes: string[];
};

/** `isi_nama_fasilitator` → text box "nama_fasilitator", label "Nama fasilitator"; `foto_utama` → photo "foto_utama", "Foto utama". Figma adds `_2` to duplicate names. */
export function parseLayer(id: string): Placeholder | null {
  const match = LAYER.exec(id.trim());
  if (!match) return null;
  const name = match[2].toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  // isi_biaya_opsional: the box "biaya", which may be left empty.
  const optional = /(^|_)(opsional|optional)$/.test(name);
  const key = name.replace(/_?(opsional|optional)$/, "").slice(0, 40);
  if (!key) return null;
  const words = key.replace(/_/g, " ");
  // A photo keeps its prefix, so foto_fasilitator and isi_fasilitator are two boxes, not one.
  if (match[1].toLowerCase() === "foto") return { id, kind: "photo", key: `foto_${key}`.slice(0, 40), label: `Foto ${words}`, optional };
  return { id, kind: "text", key, label: words.charAt(0).toUpperCase() + words.slice(1), optional };
}

/** The card size a Figma frame is: the same size, or the same shape within 2% (then scaled). */
export function matchFormat(width: number, height: number): { format: PosterFormat; scale: number } | null {
  if (!(width > 0 && height > 0)) return null;
  const exact = posterFormats.find(format => posterSizes[format].width === Math.round(width) && posterSizes[format].height === Math.round(height));
  if (exact) return { format: exact, scale: 1 };
  const ratio = width / height;
  const near = posterFormats.find(format => Math.abs(posterSizes[format].width / posterSizes[format].height - ratio) / ratio < 0.02);
  return near ? { format: near, scale: posterSizes[near].width / width } : null;
}

/** The nearest face the app has for a Figma font name. */
export function fontFor(family: string): PosterFont {
  const name = family.toLowerCase();
  if (name.includes("playfair")) return "playfair";
  if (name.includes("lora")) return "lora";
  if (name.includes("cormorant") || name.includes("garamond")) return "cormorant";
  if (/serif|times|georgia|baskerville|didot|bodoni|garamond|caslon|merriweather/.test(name) && !name.includes("sans")) return "playfair";
  if (name.includes("nunito")) return "nunito";
  // Inter is Figma's default face; any other sans (or an unknown name) is drawn in it too.
  return "inter";
}

/** An attribute or style property, from the element or the nearest ancestor that sets it. */
function inherited(element: Element | null, name: string): string {
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    const style = (node.getAttribute("style") ?? "").split(";").map(part => part.split(":")).find(([prop]) => prop?.trim() === name);
    if (style?.[1]) return style[1].trim();
    const value = node.getAttribute(name);
    if (value) return value.trim();
  }
  return "";
}
/** Figma writes pure white and black by name (fill="white"), not as #ffffff. */
const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000" };
const hex = (color: string) => {
  const value = NAMED[color.trim().toLowerCase()] ?? color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) return `#${[...value.slice(1)].map(c => c + c).join("")}`;
  const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(value);
  return rgb ? `#${rgb.slice(1).map(n => Number(n).toString(16).padStart(2, "0")).join("")}` : "";
};

/**
 * A text box from its layer. Live `<text>` (outline off) gives font, size, weight, colour,
 * spacing and the sample lines; an outlined layer only gives its shape and colour, so the size
 * is estimated from its height and the box is given room for the line height.
 */
export function textField(place: Placeholder, measured: Measured, scale: number): { field: Omit<PosterField, "box">; box: PosterBox; outlined: boolean } {
  const element = measured.element;
  const text = element.tagName.toLowerCase() === "text" ? element : element.querySelector("text");
  let { box } = measured;
  const base = { key: place.key, label: place.label, kind: "text" as const, editable: true, value: "", tone: "" as const, uppercase: false, radius: 0, fill: "#e9dfcb" };
  if (text) {
    const lines = [...text.querySelectorAll("tspan")].map(span => span.textContent ?? "").filter(line => line.trim());
    const sample = (lines.length ? lines : [text.textContent ?? ""]).map(line => line.trim()).filter(Boolean);
    const size = Number.parseFloat(inherited(text, "font-size")) * scale || 32;
    const ys = [...text.querySelectorAll("tspan")].map(span => Number.parseFloat(span.getAttribute("y") ?? "")).filter(Number.isFinite);
    const lineHeight = ys.length > 1 ? Math.min(3, Math.max(0.8, Math.round((ys[1] - ys[0]) * scale / size * 100) / 100)) : 1.2;
    const xs = new Set([...text.querySelectorAll("tspan")].map(span => span.getAttribute("x")));
    const anchor = inherited(text, "text-anchor");
    const spacing = inherited(text, "letter-spacing");
    const family = inherited(text, "font-family").split(",")[0].replace(/["']/g, "");
    const weight = Number.parseInt(inherited(text, "font-weight"), 10) || 400;
    const font = fontFor(family);
    const maxLines = Math.max(1, sample.length);
    // The measured shape hugs the glyphs; the box needs whole lines.
    box = { ...box, h: Math.max(box.h, Math.round(size * lineHeight * maxLines)) };
    return {
      box, outlined: false,
      field: {
        ...base, hint: sample.join(" ").slice(0, 200) || place.label, maxLength: Math.max(40, sample.join(" ").length * 2),
        font, weight: nearestWeight(font, weight), color: hex(inherited(text, "fill")) || "#1f2a24",
        align: anchor === "middle" ? "center" : anchor === "end" ? "right" : xs.size > 1 ? "center" : "left",
        letterSpacing: spacing.endsWith("em") ? Number.parseFloat(spacing) || 0 : (Number.parseFloat(spacing) || 0) / (size / scale),
        sizeMax: Math.round(size), sizeMin: Math.max(8, Math.round(size * 0.6)), lineHeight, maxLines,
      },
    };
  }
  const filled = element.matches("[fill]:not([fill=none])") ? element : element.querySelector("[fill]:not([fill=none])");
  const area = element.tagName.toLowerCase() === "g" && !!element.querySelector(":scope > :is(rect, circle, ellipse)[fill=none], :scope > rect:not([fill])");
  // A list's area is drawn round its own lines, so its height is all type, not room around it.
  const roomy = area && element.getAttribute("data-list") !== "true";
  const lines = Math.max(1, Math.min(20, Number.parseInt(element.getAttribute("data-lines") ?? "", 10) || guessLines(element)));
  // Glyphs of one line stand about 0.95 em tall; each further line adds a line height of 1.15 em.
  const size = Math.max(10, Math.round(box.h * (roomy ? 0.5 : 1) / (0.95 + (lines - 1) * 1.15)));
  if (!area) box = { x: box.x, y: Math.max(0, Math.round(box.y - size * 0.2)), w: box.w, h: Math.round(box.h + size * 0.4) };
  return {
    box, outlined: true,
    field: { ...base, hint: place.label, maxLength: 80, font: "inter", weight: 700, color: hex(filled?.getAttribute("fill") ?? "") || "#1f2a24", align: "left", letterSpacing: 0, sizeMax: size, sizeMin: Math.max(8, Math.round(size * 0.6)), lineHeight: lines > 1 ? 1.15 : 1.2, maxLines: lines },
  };
}

/**
 * Type hints a prepared file may carry on an isi_ layer, since outlined text keeps no type:
 * data-font (playfair|nunito|inter|lora|cormorant or a Figma font name), data-size, data-lines,
 * data-weight, data-align, data-color, data-uppercase, data-spacing (em), data-line-height,
 * data-list (one point per line).
 */
export function withHints(field: Omit<PosterField, "box">, element: Element, scale: number): { field: Omit<PosterField, "box">; hinted: boolean } {
  const read = (name: string) => element.getAttribute(`data-${name}`);
  if (![...element.attributes].some(attribute => attribute.name.startsWith("data-") && attribute.name !== "data-box")) return { field, hinted: false };
  const next = { ...field };
  const font = read("font");
  if (font) { next.font = (["playfair", "nunito", "inter", "lora", "cormorant"] as const).find(key => key === font) ?? fontFor(font); next.weight = nearestWeight(next.font, next.weight); }
  const size = Number.parseFloat(read("size") ?? "");
  if (size > 0) { next.sizeMax = Math.round(size * scale); next.sizeMin = Math.max(8, Math.round(next.sizeMax * 0.6)); }
  const lines = Number.parseInt(read("lines") ?? "", 10);
  if (lines > 0) next.maxLines = Math.min(20, lines);
  const weight = Number.parseInt(read("weight") ?? "", 10);
  if (weight > 0) next.weight = nearestWeight(next.font, weight);
  const align = read("align");
  if (align === "left" || align === "center" || align === "right") next.align = align;
  const valign = read("valign");
  if (valign === "top" || valign === "middle" || valign === "bottom") next.valign = valign;
  const color = hex(read("color") ?? "");
  if (color) next.color = color;
  if (read("uppercase") === "true") next.uppercase = true;
  const spacing = Number.parseFloat(read("spacing") ?? "");
  if (Number.isFinite(spacing)) next.letterSpacing = spacing;
  const lineHeight = Number.parseFloat(read("line-height") ?? "");
  if (lineHeight >= 0.8 && lineHeight <= 3) next.lineHeight = lineHeight;
  const hint = read("hint");
  if (hint) next.hint = hint.slice(0, 200);
  const most = Number.parseInt(read("maxlength") ?? "", 10);
  if (most > 0) next.maxLength = Math.min(1000, most);
  const label = read("label")?.trim();
  if (label) next.label = label.slice(0, 60);
  if (read("list") === "true") next.list = true;
  return { field: next, hinted: true };
}

function nearestWeight(font: PosterFont, weight: number): number {
  const weights = posterFonts[font].weights as readonly number[];
  return weights.reduce((best, w) => Math.abs(w - weight) < Math.abs(best - weight) ? w : best);
}

/** A photo box: its shape decides the frame (a circle or ellipse is round, a rect keeps its corners). */
export function photoField(place: Placeholder, measured: Measured, scale: number): { field: Omit<PosterField, "box">; box: PosterBox } {
  const element = measured.element;
  const shape = ["rect", "circle", "ellipse"].includes(element.tagName.toLowerCase()) ? element : element.querySelector("rect, circle, ellipse");
  const tag = shape?.tagName.toLowerCase();
  const radius = tag === "circle" || tag === "ellipse" ? ROUND : Math.round((Number.parseFloat(shape?.getAttribute("rx") ?? "") || 0) * scale);
  const label = element.getAttribute("data-label")?.trim().slice(0, 60) || place.label;
  // data-fit="contain": a logo or community photo whose shape differs from the box may be zoomed out to fit whole.
  const zoomOut = element.getAttribute("data-fit")?.trim().toLowerCase() === "contain";
  return {
    box: measured.box,
    field: { key: place.key, label, hint: `Unggah ${label.toLowerCase()}`, kind: "photo", editable: true, value: "", maxLength: 1, font: "nunito", weight: 600, tone: "", color: "#1f2a24", align: "left", uppercase: false, letterSpacing: 0, sizeMax: 24, sizeMin: 12, lineHeight: 1.2, maxLines: 1, radius: Math.min(ROUND, radius), fill: hex(shape?.getAttribute("fill") ?? "") || "#e9dfcb", ...(zoomOut ? { zoomOut: true } : {}) },
  };
}

/**
 * Reads a Figma SVG into a card for one size. `measure` gives each layer's box in the frame's
 * units (the browser uses getBBox and the layer's transform; tests pass their own).
 */
export function readFigmaSvg(source: string, measure: (element: Element, svg: SVGSVGElement) => PosterBox | null): FigmaImport {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const svg = doc.documentElement as unknown as SVGSVGElement;
  if (!svg || svg.tagName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) throw new Error("Berkas ini bukan SVG yang terbaca. Ekspor frame dari Figma sebagai SVG.");
  const view = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).map(Number);
  const width = view.length === 4 && view[2] > 0 ? view[2] : Number.parseFloat(svg.getAttribute("width") ?? "");
  const height = view.length === 4 && view[3] > 0 ? view[3] : Number.parseFloat(svg.getAttribute("height") ?? "");
  const matched = matchFormat(width, height);
  if (!matched) {
    throw new Error(`Ukuran frame ${Math.round(width) || "?"}×${Math.round(height) || "?"} tidak cocok dengan ukuran kartu. Gunakan salah satu: ${posterFormats.map(format => `${posterSizes[format].label} ${posterSizes[format].width}×${posterSizes[format].height}`).join(", ")}.`);
  }
  const { format, scale } = matched;
  const notes: string[] = [];
  const fields: PosterField[] = [];
  const seen = new Set<string>();
  const stacked: StackItem[] = [];
  let outlined = 0, bare = 0;
  for (const element of [...svg.querySelectorAll("[id]")]) {
    const place = parseLayer(element.getAttribute("id") ?? "");
    if (!place || seen.has(place.key)) continue;
    // A layer named like a box inside another box layer belongs to that box.
    if (element.parentElement?.closest("[id]") && parseLayer(element.parentElement.closest("[id]")!.getAttribute("id") ?? "")) continue;
    const raw = measure(element, svg);
    if (!raw || raw.w <= 0 || raw.h <= 0) { notes.push(`Layer ${place.id} tidak punya ukuran dan dilewati.`); continue; }
    const box = { x: Math.round(raw.x * scale), y: Math.round(raw.y * scale), w: Math.round(raw.w * scale), h: Math.round(raw.h * scale) };
    const made = place.kind === "photo" ? photoField(place, { box, element }, scale) : textField(place, { box, element }, scale);
    // A list's group only holds its clear area: the colour is the lines' own, which an icon
    // (one move, a ▸) is not.
    const pieces = [...svg.querySelectorAll(`[data-isi-bagian="${place.key}"]`)];
    if (place.kind === "text" && pieces.length && !element.matches("[fill]:not([fill=none])") && !element.querySelector("[fill]:not([fill=none])")) {
      const sample = pieces.find(piece => ((piece.getAttribute("d") ?? "").match(/M/gi)?.length ?? 0) >= 3) ?? pieces[0];
      made.field.color = hex(inherited(sample, "fill")) || made.field.color;
      // The type is as tall as one line of glyphs, and the points sit as far apart as in Figma
      // (a list is often spaced wider than its type): both from the lines themselves.
      const lines = pieces.filter(piece => ((piece.getAttribute("d") ?? "").match(/M/gi)?.length ?? 0) >= 3)
        .map(piece => ({ box: measure(piece, svg), count: guessLines(piece) })).filter((line): line is { box: PosterBox; count: number } => !!line.box && line.box.h > 0);
      const single = lines.filter(line => line.count === 1).map(line => line.box.h).sort((x, y) => x - y);
      const count = lines.reduce((sum, line) => sum + line.count, 0);
      if (single.length && count > 1) {
        const glyphs = single[Math.floor(single.length / 2)];
        const size = Math.max(8, Math.round(glyphs * scale / 0.95));
        const lineHeight = Math.min(3, Math.max(1, Math.round((raw.h - glyphs) / (count - 1) * scale / size * 20) / 20));
        // Text sits in the middle of its line box: the box reaches half a leading above the first line and below the last.
        const lead = Math.round((lineHeight - 1) * size / 2 + size * 0.1);
        made.box = { x: made.box.x, y: Math.max(0, made.box.y - lead), w: made.box.w, h: made.box.h + lead * 2 };
        made.field = { ...made.field, sizeMax: size, sizeMin: Math.max(8, Math.round(size * 0.75)), lineHeight };
      }
    }
    const hinted = place.kind === "text" ? withHints(made.field, element, scale) : { field: made.field, hinted: false };
    made.field = hinted.field;
    if (place.optional) made.field.optional = true;
    // A text in a susun_ group, or marked into a stack (data-susun): an item that may be empty, its heading leaving with it.
    const group = place.kind === "text" ? [...ancestors(element)].find(node => parseStack(node.getAttribute("id") ?? "")) ?? null : null;
    const stack = group ? parseStack(group.getAttribute("id") ?? "") : place.kind === "text" ? stackKey(element.getAttribute("data-susun") ?? "") : null;
    if (stack) {
      made.field.stack = stack;
      if (group) made.field.optional = true;
      stacked.push({ key: place.key, stack, group, raw, line: made.field.sizeMax * made.field.lineHeight / scale });
    }
    // Room for as many letters as the box holds, unless the designer set the limit.
    if (place.kind === "text" && !element.hasAttribute("data-maxlength")) made.field.maxLength = Math.max(made.field.maxLength, capacity(made.field, made.box));
    if ("outlined" in made && made.outlined && !hinted.hinted) outlined++;
    // A bare text layer is only as wide as its sample; a group with a clear box gives the area.
    if (place.kind === "text" && !(element.tagName.toLowerCase() === "g" && element.querySelector("rect"))) bare++;
    seen.add(place.key);
    fields.push({ ...made.field, box: boxes({ [format]: fit(made.box, format) }) });
  }
  // The shapes a list was marked on are drawn by the list itself now: out of the background, the
  // overlay and the photos' parts. Safe to cut here: the browser's measure lined up its elements
  // on the first call, made in the loop above.
  for (const element of [...svg.querySelectorAll("[data-isi-bagian]")]) element.remove();
  if (!fields.length) {
    const named = [...svg.querySelectorAll("[id]")].some(element => !/^(clip|pattern|image|paint|filter|mask)\d*_/.test(element.getAttribute("id") ?? ""));
    throw new NoLayersError(named
      ? "Tidak ada layer bernama isi_… atau foto_… di SVG ini. Di Figma, ganti nama layer yang boleh diganti peserta (misalnya isi_judul, foto_utama), lalu ekspor ulang."
      : "SVG ini tidak membawa nama layer. Saat ekspor di Figma, centang “Include \"id\" attribute”, dan beri nama layer yang boleh diganti peserta (misalnya isi_judul, foto_utama).");
  }
  if (bare) notes.push(`${bare} kolom teks selebar teks contohnya, jadi isian yang lebih panjang akan mengecil. Untuk area yang lebih lebar, kelompokkan teksnya dengan kotak transparan seukuran area dan beri nama grup itu isi_….`);
  if (outlined) notes.push(`${outlined} kolom teks berasal dari teks yang di-outline: ukuran dan hurufnya diperkirakan, periksa di pengaturan kolom.`);
  if ([...svg.querySelectorAll("text")].some(text => !parseLayer(text.closest("[id]")?.getAttribute("id") ?? ""))) {
    notes.push("Ada teks tetap yang belum di-outline: hurufnya bisa berbeda dari Figma. Centang “Outline text” saat ekspor.");
  }

  const textBox = (element: Element) => [...ancestors(element)].some(node => parseLayer(node.getAttribute("id") ?? "")?.kind === "text");
  const photoLayers = [...svg.querySelectorAll("[id]")].filter(element => parseLayer(element.getAttribute("id") ?? "")?.kind === "photo")
    .map(element => ({ element, box: measure(element, svg) })).filter((photo): photo is { element: Element; box: PosterBox } => !!photo.box);

  svg.setAttribute("width", String(posterSizes[format].width));
  svg.setAttribute("height", String(posterSizes[format].height));
  if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  // A stacked item's heading and divider: its own picture and box, so they leave and move with it.
  const bands = stackBands(svg, stacked, photoLayers, width, measure);
  for (const field of fields) {
    const band = bands.get(field.key);
    if (band) field.labelBox = { [format]: fit({ x: Math.round(band.box.x * scale), y: Math.round(band.box.y * scale), w: Math.round(band.box.w * scale), h: Math.round(band.box.h * scale) }, format) };
  }
  const banded = [...bands.values()].flatMap(band => band.shapes);
  if (stacked.length) notes.push(`${stacked.length} kolom bersusun: bila dikosongkan, judul kecil dan garis di atasnya ikut hilang, dan kolom di bawahnya naik.`);

  // Each box's own pictures, cut out of the design before the rest is split into background and overlay.
  const parts = boxParts(svg, fields, photoLayers, measure, new Set(banded));
  const picture = (elements: Element[]) => elements.length ? only(svg, elements) : null;
  const figmaParts = parts.map(part => ({ key: part.key, art: picture(part.art), slot: picture(part.slot), label: picture(bands.get(part.key)?.shapes ?? []) })).filter(part => part.art || part.slot || part.label);
  const cut = [...parts.flatMap(part => [...part.art, ...part.slot]), ...banded];
  if (parts.some(part => part.art.length)) notes.push("Ikon dan tulisan “unggah foto” di kotak foto hanya tampil sebagai petunjuk, tidak ikut di hasil unduhan.");
  const optional = fields.filter(field => field.optional).length;
  if (optional) notes.push(`${optional} kolom opsional: bila dibiarkan kosong, kotaknya tidak ikut di hasil unduhan.`);

  // Shapes Figma draws after a photo, over its area, would hide behind the guest's photo: they
  // go to the overlay, drawn above the photos. Everything else stays in the background.
  // Worked out while the cut-out parts are still in place: drawing order needs them in the document.
  const above = [...svg.querySelectorAll(SHAPES)].filter(element => !element.closest("defs, clipPath, mask, pattern") && !textBox(element)
    && !cut.some(part => part === element || part.contains(element))
    && photoLayers.some(photo => photo.element !== element && !photo.element.contains(element)
      && !!(photo.element.compareDocumentPosition(element) & 4) && overlaps(measure(element, svg), photo.box)));
  for (const element of cut) element.remove();

  // Text layers leave the background, all but a plate the text sits on (kept in the design).
  for (const element of [...svg.querySelectorAll("[id]")]) {
    if (parseLayer(element.getAttribute("id") ?? "")?.kind !== "text") continue;
    const plates = element.matches(SHAPES) ? [] : [...element.querySelectorAll(SHAPES)].filter(plate);
    if (!plates.length) { element.remove(); continue; }
    for (const shape of [...element.querySelectorAll(SHAPES)]) if (!plates.includes(shape)) shape.remove();
    element.removeAttribute("id");
  }
  let overlay: string | null = null;
  if (above.length) {
    overlay = only(svg, above);
    for (const element of above) element.remove();
    notes.push(`${above.length} elemen yang menumpang di atas foto (misalnya pita label) tetap tampil di atas foto peserta.`);
  }
  return { format, background: new XMLSerializer().serializeToString(svg), overlay, parts: figmaParts, fields, notes };
}

/** A filled box (not glyphs, not a clear area): the plate or ribbon a text sits on. */
const plate = (element: Element) => BOXES.includes(element.tagName.toLowerCase()) && !/^(none|transparent)$/i.test(inherited(element, "fill") || "black");
const drawn = (element: Element) => !element.closest("defs, clipPath, mask, pattern");

/** The frame, sized to the format, with only these shapes showing (the rest kept for their defs and clips). */
function only(svg: SVGSVGElement, shown: Element[]): string {
  const mark = "data-wk-tampil";
  const marked = shown.flatMap(element => element.matches(SHAPES) ? [element] : [...element.querySelectorAll(SHAPES)]);
  for (const element of marked) element.setAttribute(mark, "");
  const copy = svg.cloneNode(true) as SVGSVGElement;
  for (const element of marked) element.removeAttribute(mark);
  for (const element of copy.querySelectorAll(SHAPES)) if (!element.hasAttribute(mark) && drawn(element)) element.setAttribute("visibility", "hidden");
  for (const element of copy.querySelectorAll(`[${mark}]`)) element.removeAttribute(mark);
  return new XMLSerializer().serializeToString(copy);
}

/**
 * What belongs to each box rather than to the design:
 * - `art`: inside a photo box, the small marks drawn on it, away from its edges (a camera icon,
 *   "Foto fasilitator"). They only tell the guest where a photo goes.
 * - `slot`: an optional box's own shapes (the photo box, a frame the size of it, the plate under
 *   a text), so an empty optional box leaves no trace.
 */
function boxParts(svg: SVGSVGElement, fields: PosterField[], photos: { element: Element; box: PosterBox }[], measure: (element: Element, svg: SVGSVGElement) => PosterBox | null, banded: ReadonlySet<Element>) {
  const optional = new Set(fields.filter(field => field.optional).map(field => field.key));
  const layers = [...svg.querySelectorAll("[id]")].map(element => ({ element, place: parseLayer(element.getAttribute("id") ?? "") }))
    .filter((layer): layer is { element: Element; place: Placeholder } => !!layer.place && fields.some(field => field.key === layer.place!.key));
  const inLayer = (element: Element) => layers.some(layer => layer.element.contains(element));
  // A stacked item's heading is its own, never a photo's mark.
  const shapes = [...svg.querySelectorAll(SHAPES)].filter(shape => drawn(shape) && !banded.has(shape));
  const result: { key: string; art: Element[]; slot: Element[] }[] = [];
  for (const { element, place } of layers) {
    const own = element.matches(SHAPES) ? [element] : [...element.querySelectorAll(SHAPES)].filter(drawn);
    if (place.kind === "text") {
      result.push({ key: place.key, art: [], slot: optional.has(place.key) ? own.filter(plate) : [] });
      continue;
    }
    const box = photos.find(photo => photo.element === element)?.box;
    if (!box) continue;
    // Shapes on the photo box: in its layer, or drawn after it by no other layer.
    const on = shapes.filter(shape => !own.includes(shape) && (element.contains(shape) || (!inLayer(shape) && !!(element.compareDocumentPosition(shape) & 4))))
      .map(shape => ({ shape, box: measure(shape, svg) })).filter((item): item is { shape: Element; box: PosterBox } => !!item.box && within(item.box, box));
    const frames = on.filter(item => sameBox(item.box, box)).map(item => item.shape);
    const art = on.filter(item => !sameBox(item.box, box) && central(item.box, box)).map(item => item.shape);
    // Every photo box is a slot: shown while empty, gone under the guest's photo (a transparent PNG must not show it).
    result.push({ key: place.key, art, slot: [...own, ...frames] });
  }
  return result;
}

/** A stacked text: its box in the frame's units, its susun_ group (null when marked), and one line's height in frame units. */
type StackItem = { key: string; stack: string; group: Element | null; raw: PosterBox; line: number };

/**
 * Each stacked item's own design, the small heading over it and a divider above that, by the
 * item's key: what leaves with the item when it is empty and moves up with it otherwise.
 * - Named (susun_…): the group's other shapes, each to the first item whose text starts below
 *   it; what lies below the last text is the last item's. A shape reaching over an item's text
 *   (a panel behind them all) is no one's and stays in the design.
 * - Marked (data-susun): no group holds them, so they are the frame's free shapes in the stack's
 *   column (its texts' width, 2% of the frame wider each side), between the item above's text
 *   and this one's; over the first item, up to three of its lines.
 * Shapes in a box layer, or inside a photo, are never a heading.
 */
function stackBands(svg: SVGSVGElement, items: StackItem[], photos: { box: PosterBox }[], width: number, measure: (element: Element, svg: SVGSVGElement) => PosterBox | null) {
  const bands = new Map<string, { shapes: Element[]; box: PosterBox }>();
  const taken = new Set<Element>();
  const free = (shape: Element) => drawn(shape) && ![...ancestors(shape)].some(node => parseLayer(node.getAttribute("id") ?? ""));
  for (const stack of new Set(items.map(item => item.stack))) {
    const sorted = items.filter(item => item.stack === stack).sort((a, b) => a.raw.y - b.raw.y);
    const group = sorted[0].group;
    const shapes = [...(group ?? svg).querySelectorAll(SHAPES)].filter(shape => free(shape) && !taken.has(shape))
      .map(shape => ({ shape, box: measure(shape, svg) })).filter((item): item is { shape: Element; box: PosterBox } => { const box = item.box; return !!box && !photos.some(photo => within(box, photo.box)); });
    const left = Math.min(...sorted.map(item => item.raw.x)) - width * 0.02, right = Math.max(...sorted.map(item => item.raw.x + item.raw.w)) + width * 0.02;
    for (const { shape, box } of shapes) {
      const bottom = box.y + box.h;
      const owner = group
        ? sorted.find((item, n) => item.raw.y >= bottom - 1 && (n === 0 || box.y >= sorted[n - 1].raw.y - 1)) ?? (box.y >= sorted[sorted.length - 1].raw.y - 1 ? sorted[sorted.length - 1] : undefined)
        : box.x >= left && box.x + box.w <= right ? sorted.find((item, n) => {
          const top = n ? sorted[n - 1].raw.y + sorted[n - 1].raw.h : item.raw.y - item.line * 3;
          return box.y >= top - 1 && bottom <= item.raw.y + 1;
        }) : undefined;
      if (!owner) continue;
      taken.add(shape);
      const band = bands.get(owner.key);
      if (!band) { bands.set(owner.key, { shapes: [shape], box }); continue; }
      const x = Math.min(band.box.x, box.x), y = Math.min(band.box.y, box.y);
      band.shapes.push(shape);
      band.box = { x, y, w: Math.max(band.box.x + band.box.w, box.x + box.w) - x, h: Math.max(band.box.y + band.box.h, bottom) - y };
    }
  }
  return bands;
}
const within = (a: PosterBox, b: PosterBox) => a.x >= b.x - 2 && a.y >= b.y - 2 && a.x + a.w <= b.x + b.w + 2 && a.y + a.h <= b.y + b.h + 2;
const sameBox = (a: PosterBox, b: PosterBox) => Math.abs(a.x - b.x) <= 3 && Math.abs(a.y - b.y) <= 3 && Math.abs(a.w - b.w) <= 6 && Math.abs(a.h - b.h) <= 6;
/**
 * Small and clear of the box's edges: a mark drawn on it (a camera icon, "Foto fasilitator"),
 * not a ribbon laid along its edge. A wide slot may set its icon well to one side.
 */
const central = (a: PosterBox, b: PosterBox) => {
  const margin = Math.max(3, Math.min(b.w, b.h) * 0.04);
  return a.w * a.h < b.w * b.h * 0.4 && a.x >= b.x + margin && a.y >= b.y + margin && a.x + a.w <= b.x + b.w - margin && a.y + a.h <= b.y + b.h - margin;
};

function* ancestors(element: Element) { for (let node: Element | null = element; node; node = node.parentElement) yield node; }
/** Whether two boxes share more than a hairline: shapes that only touch a photo's edge stay in the background. */
const overlaps = (a: PosterBox | null, b: PosterBox, edge = 1) => !!a && a.w > 0 && a.h > 0 && a.x < b.x + b.w - edge && b.x < a.x + a.w - edge && a.y < b.y + b.h - edge && b.y < a.y + a.h - edge;

const fit = (box: PosterBox, format: PosterFormat): PosterBox => {
  const { width, height } = posterSizes[format];
  const w = Math.max(1, Math.min(box.w, width)), h = Math.max(1, Math.min(box.h, height));
  return { x: Math.min(Math.max(0, box.x), width - w), y: Math.min(Math.max(0, box.y), height - h), w, h };
};

/**
 * The poster's boxes after an import: a design from the gallery is replaced; an earlier Figma
 * import gains this size for the boxes it shares, keeps what the admin set on them (label,
 * locked text, hint) but takes the look (face, size, colour) from the new SVG, and gains the
 * new ones. The new SVG is the whole truth for its size: a
 * box it no longer has leaves that size (an older design uploaded for the same size would
 * otherwise still show through), and a box left with no size at all is dropped.
 */
export function mergeImport(current: PosterField[], fromFigma: boolean, imported: FigmaImport): PosterField[] {
  if (!fromFigma) return imported.fields;
  const byKey = new Map(imported.fields.map(field => [field.key, field]));
  const merged = current.flatMap(field => {
    const next = byKey.get(field.key);
    const box = { ...field.box, [imported.format]: next?.box[imported.format] ?? null };
    if (!Object.values(box).some(Boolean)) return [];
    // A stacked item's heading box is per size, like its box: this size's comes from the new SVG only.
    const labelBox = Object.fromEntries(Object.entries({ ...field.labelBox, [imported.format]: next?.labelBox?.[imported.format] }).filter(([, value]) => value)) as NonNullable<PosterField["labelBox"]>;
    const headed = (made: PosterField): PosterField => { const rest = { ...made }; delete rest.labelBox; return Object.keys(labelBox).length ? { ...rest, labelBox } : rest; };
    if (!next) return [headed({ ...field, box })];
    const stack = next.stack ?? field.stack;
    const kept = { label: field.label, hint: field.hint, editable: field.editable, value: field.value, maxLength: Math.max(field.maxLength, next.maxLength), optional: !!(next.optional || field.optional), zoomOut: !!(next.zoomOut || field.zoomOut), list: !!(next.list || field.list), ...(stack ? { stack } : {}) };
    // A design for another size fills the same box: the look stays the first design's, and only
    // how much larger or smaller its type is in this size is kept.
    if (posterFormats.some(format => format !== imported.format && field.box[format])) {
      const factor = Math.round(next.sizeMax / Math.max(1, field.sizeMax) * 100) / 100;
      return [headed({ ...field, ...kept, maxLines: Math.max(field.maxLines, next.maxLines), sizes: { ...field.sizes, [imported.format]: Math.min(5, Math.max(0.2, factor)) }, box })];
    }
    // The same size again: a look left over from an earlier file (a colour read wrong, a gallery
    // tone) must not outlive the design that now draws the box.
    return [headed({ ...next, ...kept, box })];
  });
  return [...merged, ...imported.fields.filter(field => !current.some(item => item.key === field.key))];
}

/** In the browser: a layer's box in the frame's units, from its bounding box through its transform. */
export function measureInDocument(element: Element, svg: SVGSVGElement): PosterBox | null {
  const graphic = element as SVGGraphicsElement;
  if (typeof graphic.getBBox !== "function") return null;
  const bbox = graphic.getBBox();
  const toFrame = svg.getScreenCTM()?.inverse().multiply(graphic.getScreenCTM() ?? new DOMMatrix()) ?? null;
  if (!toFrame) return { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height };
  const corners = [[bbox.x, bbox.y], [bbox.x + bbox.width, bbox.y], [bbox.x, bbox.y + bbox.height], [bbox.x + bbox.width, bbox.y + bbox.height]]
    .map(([x, y]) => new DOMPoint(x, y).matrixTransform(toFrame));
  const xs = corners.map(point => point.x), ys = corners.map(point => point.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Reads a Figma SVG in the page: mounted out of sight so the browser can lay it out and measure it. */
export function importInBrowser(raw: string): FigmaImport {
  const source = sanitizeSvg(raw);
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-99999px;top:0;width:4000px;height:4000px;visibility:hidden;pointer-events:none";
  holder.innerHTML = new DOMParser().parseFromString(source, "image/svg+xml").documentElement.outerHTML;
  document.body.append(holder);
  try {
    const live = holder.querySelector("svg");
    if (!live) throw new Error("Berkas ini bukan SVG yang terbaca. Ekspor frame dari Figma sebagai SVG.");
    // Boxes measured on the live copy, matched to the parsed copy by position in the document:
    // both come from the same source, so their elements line up one to one.
    const liveAll = [...live.querySelectorAll("*")];
    let parsedAll: Element[] | null = null;
    return readFigmaSvg(source, (element, svg) => {
      parsedAll ??= [...svg.querySelectorAll("*")];
      const match = liveAll[parsedAll.indexOf(element)];
      return match && match.tagName.toLowerCase() === element.tagName.toLowerCase() ? measureInDocument(match, live) : null;
    });
  } finally { holder.remove(); }
}

/** The widest image the upload keeps (its largest WebP size): designs are drawn up to it. */
const UPLOAD_WIDTH = 2048;
/** Below the upload limit (8 MB), with room for the form around the file. */
const UPLOAD_BYTES = 7.5 * 1024 * 1024;

/**
 * A layer of the design drawn to an image for upload: about twice the card's size (as wide as the
 * upload keeps), so fixed headings, logos and icons stay sharp when the card is zoomed in or seen
 * on a sharp screen. PNG keeps transparency; an `opaque` background that would be too heavy as a
 * PNG (a full-bleed photo) goes as a high-quality JPEG on white instead.
 */
export async function designImage(svg: string, format: PosterFormat, { opaque = false } = {}): Promise<Blob> {
  const { width, height } = posterSizes[format];
  const scale = Math.max(1, Math.min(2, UPLOAD_WIDTH / width));
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Latar dari SVG tidak bisa digambar. Coba ekspor ulang dari Figma.")); image.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser ini tidak bisa menggambar latar.");
    const encode = (type: string, quality?: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Latar gagal dibuat.")), type, quality));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await encode("image/png");
    if (!opaque || png.size <= UPLOAD_BYTES) return png;
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return await encode("image/jpeg", 0.92);
  } finally { URL.revokeObjectURL(url); }
}

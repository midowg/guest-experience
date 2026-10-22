import { boxes, posterFormats, posterSizes, type PosterBox, type PosterField, type PosterFont, type PosterFormat } from "@/lib/poster";

/**
 * A card design straight from Figma. The designer names the layers guests may change
 * `isi_<name>` (text) or `foto_<name>` (photo) and exports the frame as SVG with "Include id"
 * (and best "Outline text"). Here the SVG becomes the card: those layers become boxes (position,
 * size, type style), the rest becomes the background. Nothing but the background image is
 * uploaded; the SVG itself is not kept.
 */

const LAYER = /^(isi|foto)[-_](.+?)(?:_\d+)?$/i;
const ROUND = 500;

export type Placeholder = { id: string; kind: "text" | "photo"; key: string; label: string };
export type Measured = { box: PosterBox; element: Element };
export type FigmaImport = {
  format: PosterFormat;
  /** The SVG with the text layers taken out, sized to the format: drawn as the background. */
  background: string;
  fields: PosterField[];
  notes: string[];
};

/** `isi_nama_fasilitator` → text box "nama_fasilitator", label "Nama fasilitator". Figma adds `_2` to duplicate names. */
export function parseLayer(id: string): Placeholder | null {
  const match = LAYER.exec(id.trim());
  if (!match) return null;
  const key = match[2].toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  if (!key) return null;
  const words = key.replace(/_/g, " ");
  return { id, kind: match[1].toLowerCase() === "foto" ? "photo" : "text", key, label: words.charAt(0).toUpperCase() + words.slice(1) };
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
  return "nunito";
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
const hex = (color: string) => {
  const value = color.trim().toLowerCase();
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
  const filled = element.matches("[fill]") ? element : element.querySelector("[fill]:not([fill=none])");
  const size = Math.max(10, Math.round(box.h * 0.95));
  box = { x: box.x, y: Math.max(0, Math.round(box.y - box.h * 0.12)), w: box.w, h: Math.round(box.h * 1.25) };
  return {
    box, outlined: true,
    field: { ...base, hint: place.label, maxLength: 80, font: "nunito", weight: 700, color: hex(filled?.getAttribute("fill") ?? "") || "#1f2a24", align: "left", letterSpacing: 0, sizeMax: size, sizeMin: Math.max(8, Math.round(size * 0.6)), lineHeight: 1.2, maxLines: 1 },
  };
}

function nearestWeight(font: PosterFont, weight: number): number {
  const weights: Record<PosterFont, number[]> = { playfair: [400, 600], nunito: [400, 600, 700, 800], lora: [400, 600], cormorant: [500, 600] };
  return weights[font].reduce((best, w) => Math.abs(w - weight) < Math.abs(best - weight) ? w : best);
}

/** A photo box: its shape decides the frame (a circle or ellipse is round, a rect keeps its corners). */
export function photoField(place: Placeholder, measured: Measured, scale: number): { field: Omit<PosterField, "box">; box: PosterBox } {
  const element = measured.element;
  const shape = ["rect", "circle", "ellipse"].includes(element.tagName.toLowerCase()) ? element : element.querySelector("rect, circle, ellipse");
  const tag = shape?.tagName.toLowerCase();
  const radius = tag === "circle" || tag === "ellipse" ? ROUND : Math.round((Number.parseFloat(shape?.getAttribute("rx") ?? "") || 0) * scale);
  return {
    box: measured.box,
    field: { key: place.key, label: place.label, hint: `Unggah ${place.label.toLowerCase()}`, kind: "photo", editable: true, value: "", maxLength: 1, font: "nunito", weight: 600, tone: "", color: "#1f2a24", align: "left", uppercase: false, letterSpacing: 0, sizeMax: 24, sizeMin: 12, lineHeight: 1.2, maxLines: 1, radius: Math.min(ROUND, radius), fill: hex(shape?.getAttribute("fill") ?? "") || "#e9dfcb" },
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
  let outlined = 0;
  for (const element of [...svg.querySelectorAll("[id]")]) {
    const place = parseLayer(element.getAttribute("id") ?? "");
    if (!place || seen.has(place.key)) continue;
    // A layer named like a box inside another box layer belongs to that box.
    if (element.parentElement?.closest("[id]") && parseLayer(element.parentElement.closest("[id]")!.getAttribute("id") ?? "")) continue;
    const raw = measure(element, svg);
    if (!raw || raw.w <= 0 || raw.h <= 0) { notes.push(`Layer ${place.id} tidak punya ukuran dan dilewati.`); continue; }
    const box = { x: Math.round(raw.x * scale), y: Math.round(raw.y * scale), w: Math.round(raw.w * scale), h: Math.round(raw.h * scale) };
    const made = place.kind === "photo" ? photoField(place, { box, element }, scale) : textField(place, { box, element }, scale);
    if ("outlined" in made && made.outlined) outlined++;
    seen.add(place.key);
    fields.push({ ...made.field, box: boxes({ [format]: fit(made.box, format) }) });
  }
  if (!fields.length) throw new Error("Tidak ada layer bernama isi_… atau foto_… di SVG ini. Beri nama layer yang boleh diganti peserta, lalu ekspor dengan “Include id”.");
  if (outlined) notes.push(`${outlined} kolom teks berasal dari teks yang di-outline: ukuran dan hurufnya diperkirakan, periksa di pengaturan kolom.`);
  if ([...svg.querySelectorAll("text")].some(text => !parseLayer(text.closest("[id]")?.getAttribute("id") ?? ""))) {
    notes.push("Ada teks tetap yang belum di-outline: hurufnya bisa berbeda dari Figma. Centang “Outline text” saat ekspor.");
  }

  // The background: the same frame without the text boxes (photo shapes stay as placeholders).
  for (const element of [...svg.querySelectorAll("[id]")]) if (parseLayer(element.getAttribute("id") ?? "")?.kind === "text") element.remove();
  svg.setAttribute("width", String(posterSizes[format].width));
  svg.setAttribute("height", String(posterSizes[format].height));
  if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  return { format, background: new XMLSerializer().serializeToString(svg), fields, notes };
}

const fit = (box: PosterBox, format: PosterFormat): PosterBox => {
  const { width, height } = posterSizes[format];
  const w = Math.max(1, Math.min(box.w, width)), h = Math.max(1, Math.min(box.h, height));
  return { x: Math.min(Math.max(0, box.x), width - w), y: Math.min(Math.max(0, box.y), height - h), w, h };
};

/**
 * The poster's boxes after an import: a design from the gallery is replaced; an earlier Figma
 * import gains this size for the boxes it shares, keeps what the admin set on them (label,
 * locked text, hint), and gains the new ones.
 */
export function mergeImport(current: PosterField[], fromFigma: boolean, imported: FigmaImport): PosterField[] {
  if (!fromFigma) return imported.fields;
  const byKey = new Map(imported.fields.map(field => [field.key, field]));
  const merged = current.map(field => {
    const next = byKey.get(field.key);
    return next ? { ...field, box: { ...field.box, [imported.format]: next.box[imported.format] } } : field;
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
export function importInBrowser(source: string): FigmaImport {
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-99999px;top:0;width:4000px;height:4000px;visibility:hidden;pointer-events:none";
  holder.innerHTML = new DOMParser().parseFromString(source, "image/svg+xml").documentElement.outerHTML;
  document.body.append(holder);
  try {
    const live = holder.querySelector("svg");
    if (!live) throw new Error("Berkas ini bukan SVG yang terbaca. Ekspor frame dari Figma sebagai SVG.");
    // Boxes measured on the live copy, matched to the parsed copy by id.
    const boxesById = new Map<string, PosterBox | null>();
    for (const element of live.querySelectorAll("[id]")) boxesById.set(element.getAttribute("id")!, measureInDocument(element, live));
    return readFigmaSvg(source, element => boxesById.get(element.getAttribute("id") ?? "") ?? null);
  } finally { holder.remove(); }
}

/** The background SVG drawn to a PNG at the card's size, ready to upload like any photo. */
export async function backgroundPng(svg: string, format: PosterFormat): Promise<Blob> {
  const { width, height } = posterSizes[format];
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Latar dari SVG tidak bisa digambar. Coba ekspor ulang dari Figma.")); image.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser ini tidak bisa menggambar latar.");
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Latar gagal dibuat.")), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}

import { activePalette, partOf, pdfPage, photoPlacement, posterSizes, slotShows, spacedWidth, toneColor, type PosterFormat, type PosterSettings, type PosterValues } from "@/lib/poster";
import { createMeasure, fontOf, layoutTexts, loadPosterFonts, posterBackground } from "./layout";

/**
 * The download: the same lines the screen shows (layoutTexts), drawn on a canvas at full size
 * with the background and the framed photos. Nothing leaves the browser.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Gambar tidak termuat: ${src}`));
    image.src = src;
  });
}

function roundedClip(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  context.beginPath();
  if (r > 0 && typeof context.roundRect === "function") context.roundRect(x, y, w, h, r);
  else context.rect(x, y, w, h);
  context.clip();
}

export async function renderPoster(poster: PosterSettings, values: PosterValues, format: PosterFormat, scale = 1): Promise<HTMLCanvasElement> {
  const size = posterSizes[format];
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size.width * scale); canvas.height = Math.round(size.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Browser ini tidak bisa membuat gambar.");
  context.scale(scale, scale);
  const palette = activePalette(poster, values);
  context.fillStyle = palette.colors.background;
  context.fillRect(0, 0, size.width, size.height);
  await loadPosterFonts(poster.fields);

  const background = posterBackground(poster, format, palette);
  if (background) context.drawImage(await loadImage(background), 0, 0, size.width, size.height);
  // A box's frame or plate: an optional box left empty leaves none. The "upload a photo" marks never come along.
  const slots = async (kind: "text" | "photo") => {
    for (const field of poster.fields) {
      const url = field.kind === kind && field.box[format] ? partOf(poster, format, field.key)?.slot.url : "";
      if (url && slotShows(field, values, false)) context.drawImage(await loadImage(url), 0, 0, size.width, size.height);
    }
  };
  await slots("photo");

  for (const field of poster.fields) {
    const box = field.box[format], photo = values.photos[field.key];
    if (field.kind !== "photo" || !box || !photo) continue;
    const image = await loadImage(photo.url);
    const place = photoPlacement(box, { width: image.naturalWidth, height: image.naturalHeight }, photo.frame);
    context.save();
    roundedClip(context, box.x, box.y, box.w, box.h, field.radius);
    context.drawImage(image, box.x + place.left, box.y + place.top, place.width, place.height);
    context.restore();
  }

  const overlay = poster.formats[format].overlay?.url;
  if (overlay) context.drawImage(await loadImage(overlay), 0, 0, size.width, size.height);
  await slots("text");

  for (const { field, fitted } of layoutTexts(poster, values, format, false)) {
    const box = field.box[format]!;
    const measure = createMeasure(field);
    const line = fitted.size * fitted.lineHeight;
    context.font = fontOf(field, fitted.size);
    context.fillStyle = toneColor(field, palette);
    context.textBaseline = "alphabetic";
    // Where CSS puts the baseline in a line box: half the leading above the font's ascent.
    const metrics = context.measureText("Hg");
    const ascent = metrics.fontBoundingBoxAscent || fitted.size * 0.8, descent = metrics.fontBoundingBoxDescent || fitted.size * 0.2;
    fitted.lines.forEach((text, index) => {
      const width = spacedWidth(measure, text, fitted.size, field.letterSpacing);
      const x = field.align === "center" ? box.x + (box.w - width) / 2 : field.align === "right" ? box.x + box.w - width : box.x;
      const y = box.y + index * line + (line - ascent - descent) / 2 + ascent;
      if (!field.letterSpacing) { context.fillText(text, x, y); return; }
      let cursor = x;
      for (const character of text) { context.fillText(character, cursor, y); cursor += measure(character, fitted.size) + field.letterSpacing * fitted.size; }
    });
  }
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Gambar gagal dibuat.")), type); }
    catch { reject(new Error("Latar poster tidak boleh dipakai untuk unduhan. Minta admin mengunggah ulang latarnya.")); }
  });
}

/**
 * One PDF page: the real paper size for print formats (A4, A5, ID card), otherwise half a point
 * per design pixel. The picture is drawn at 2x so it stays sharp when printed.
 */
export async function posterPdf(poster: PosterSettings, values: PosterValues, format: PosterFormat): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const [width, height] = pdfPage(format);
  const png = await canvasBlob(await renderPoster(poster, values, format, 2));
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(await png.arrayBuffer());
  const page = pdf.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** The phone's own share sheet (WhatsApp, Instagram …) when it can take files. */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function" || typeof File === "undefined") return false;
  try { return navigator.canShare({ files: [new File([""], "poster.png", { type: "image/png" })] }); } catch { return false; }
}
export async function shareBlob(blob: Blob, filename: string, title: string): Promise<void> {
  await navigator.share({ files: [new File([blob], filename, { type: blob.type })], title });
}

export function posterFilename(title: string, format: PosterFormat, extension: string) {
  const slug = title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "poster";
  return `${slug}-${format}.${extension}`;
}

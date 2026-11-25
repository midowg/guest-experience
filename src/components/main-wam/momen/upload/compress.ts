import { centerCrop, fitSide, halvingSteps, LARGE_RULE, squareCrop, THUMB_RULE, TILE_RULE, type Rect } from "@/lib/main-wam/momen/image";
import { activeLang, t } from "@/lib/main-wam/i18n";
import { applyFilterToPixels, cssFilter, DEFAULT_CAMERA_TONE, type CameraToneId } from "@/lib/main-wam/momen/camera-filters";
import { drawTemplate, loadTemplateAssets } from "@/lib/main-wam/momen/camera-template-draw";
import { DEFAULT_SIGN, templateLayout, type SignId } from "@/lib/main-wam/momen/camera-templates";
import { MAX_LARGE_BYTES } from "@/lib/main-wam/momen/filters";
import { sourceProblem } from "@/lib/pra-wam/photo";

/*
 * A Momen photo made ready in the browser (RISET §2, the pattern of prepareMinutePhoto): decoded
 * upright (EXIF through createImageBitmap "from-image"; never turned by hand), cut to 4:5, and
 * written three times as JPEG: besar ≤ 500 KB, kecil 480 px, ubin 160 px. One photo at a time
 * (memory on small phones), canvases emptied afterwards, Blobs (not data URLs).
 */

export class PhotoProblem extends Error {
  constructor(message: string) { super(message); this.name = "PhotoProblem"; }
}

export type Picture = { source: CanvasImageSource; width: number; height: number; close: () => void };
export type Prepared = { besar: Blob; kecil: Blob; ubin: Blob; width: number; height: number };

const unreadable = () => new PhotoProblem(t(activeLang(), "srv.momen.unreadableFormat"));

/** A picked or captured file, upright as the camera meant it. */
export async function decodeFile(file: File): Promise<Picture> {
  const problem = sourceProblem(file);
  if (problem) throw new PhotoProblem(problem);
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    // Older browsers without the options: an <img> follows EXIF orientation too.
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try { await image.decode(); } catch { URL.revokeObjectURL(url); throw unreadable(); }
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  }
}

/** The frame the live viewfinder shows now, plain: no tone and no sign (those are chosen in "Periksa fotomu" and drawn when the photo is sent: applyLook). */
export async function grabFrame(video: HTMLVideoElement): Promise<Picture> {
  const width = video.videoWidth, height = video.videoHeight;
  if (!width || !height) throw new PhotoProblem(t(activeLang(), "srv.momen.cameraNotReady"));
  try {
    const bitmap = await createImageBitmap(video);
    return { source: bitmap, width, height, close: () => bitmap.close() };
  } catch {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
    return { source: canvas, width, height, close: () => { canvas.width = 0; canvas.height = 0; } };
  }
}

/** The longest side of the original kept from the live viewfinder (the camera's own size, at most this). */
const RAW_SIDE = 2560;

/**
 * The plain frame as a JPEG file (the original: no sign, no tone, not cut): what "Periksa fotomu" shows and what "Simpan asli di HP"
 * keeps. A file, so the editor can show it (an object URL) and the sending can read it again like a picked photo.
 */
export async function frameFile(video: HTMLVideoElement): Promise<File> {
  const picture = await grabFrame(video);
  try {
    const size = fitSide(picture.width, picture.height, RAW_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoProblem(t(activeLang(), "srv.momen.cannotShrink"));
    context.drawImage(picture.source, 0, 0, size.width, size.height);
    const blob = await jpeg(canvas, 0.92);
    canvas.width = 0; canvas.height = 0;
    return new File([blob], "momen.jpg", { type: "image/jpeg" });
  } finally {
    picture.close();
  }
}

/**
 * The look chosen in the editor drawn into the photo that is sent: cut to 4:5 like the preview, the tone first, then the sign over it (so its
 * words and mark keep their colours). Nothing chosen = the picture as it is. The picture given is closed once its look is drawn.
 */
export async function applyLook(picture: Picture, sign: SignId = DEFAULT_SIGN, tone: CameraToneId = DEFAULT_CAMERA_TONE): Promise<Picture> {
  if (sign === DEFAULT_SIGN && tone === DEFAULT_CAMERA_TONE) return picture;
  const crop = centerCrop(picture.width, picture.height);
  const size = fitSide(crop.width, crop.height, 2000);
  const canvas = document.createElement("canvas");
  canvas.width = size.width; canvas.height = size.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return picture;
  // The preview's tone, drawn into the photo that is sent: canvas `filter` where the browser has it, else the same matrices on the pixels.
  const toned = tone !== DEFAULT_CAMERA_TONE;
  const native = typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;
  if (toned && native) context.filter = cssFilter(tone);
  context.drawImage(picture.source, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
  if (toned && native) context.filter = "none";
  else if (toned) {
    const pixels = context.getImageData(0, 0, size.width, size.height);
    applyFilterToPixels(pixels.data, tone);
    context.putImageData(pixels, 0, 0);
  }
  // The sign (frame, words, mark) over the toned photo; a mark that did not load, or a drawing that fails, never costs the photo.
  if (sign !== DEFAULT_SIGN) {
    try {
      const assets = await loadTemplateAssets();
      drawTemplate(context, templateLayout(sign, size.width, size.height, activeLang()), assets);
    } catch { /* the toned photo goes without the sign */ }
  }
  picture.close();
  return { source: canvas, width: size.width, height: size.height, close: () => { canvas.width = 0; canvas.height = 0; } };
}

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoProblem(t(activeLang(), "srv.momen.cannotShrink"));
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}
const release = (canvas: HTMLCanvasElement) => { canvas.width = 0; canvas.height = 0; };

/** Draws a part of a picture at a size, at most halving per step (sharp from a large photo). */
function drawScaled(source: CanvasImageSource, from: Rect, to: { width: number; height: number }): HTMLCanvasElement {
  let current: { image: CanvasImageSource; rect: Rect } = { image: source, rect: from };
  let last: HTMLCanvasElement | null = null;
  for (const step of halvingSteps(from, to)) {
    const { canvas, context } = canvasOf(step.width, step.height);
    context.fillStyle = "#fff"; // JPEG has no transparency
    context.fillRect(0, 0, step.width, step.height);
    context.drawImage(current.image, current.rect.x, current.rect.y, current.rect.width, current.rect.height, 0, 0, step.width, step.height);
    if (last) release(last);
    last = canvas;
    current = { image: canvas, rect: { x: 0, y: 0, width: step.width, height: step.height } };
  }
  return last!;
}

async function jpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
  // A browser that cannot write JPEG answers another type (PNG): never send that.
  if (!blob || blob.type !== "image/jpeg") throw new PhotoProblem(t(activeLang(), "srv.momen.cannotJpeg"));
  return blob;
}

/** The three JPEGs of a photo; the picture is closed afterwards. */
export async function prepareMomenPhoto(picture: Picture): Promise<Prepared> {
  const canvases: HTMLCanvasElement[] = [];
  try {
    const crop = centerCrop(picture.width, picture.height);
    if (!crop.width || !crop.height) throw unreadable();
    let large: { canvas: HTMLCanvasElement; blob: Blob } | null = null;
    for (const side of LARGE_RULE.sides) {
      const canvas = drawScaled(picture.source, crop, fitSide(crop.width, crop.height, side));
      canvases.push(canvas);
      for (const quality of LARGE_RULE.qualities) {
        const blob = await jpeg(canvas, quality);
        large = { canvas, blob };
        if (blob.size <= LARGE_RULE.bytes) break;
      }
      if (large && large.blob.size <= LARGE_RULE.bytes) break;
    }
    if (!large || large.blob.size > MAX_LARGE_BYTES) throw new PhotoProblem(t(activeLang(), "srv.momen.tooBig"));
    const full = { x: 0, y: 0, width: large.canvas.width, height: large.canvas.height };
    const thumbCanvas = drawScaled(large.canvas, full, fitSide(full.width, full.height, THUMB_RULE.side));
    canvases.push(thumbCanvas);
    const tileCanvas = drawScaled(large.canvas, squareCrop(full.width, full.height), { width: TILE_RULE.side, height: TILE_RULE.side });
    canvases.push(tileCanvas);
    const [kecil, ubin] = await Promise.all([jpeg(thumbCanvas, THUMB_RULE.quality), jpeg(tileCanvas, TILE_RULE.quality)]);
    return { besar: large.blob, kecil, ubin, width: large.canvas.width, height: large.canvas.height };
  } finally {
    picture.close();
    canvases.forEach(release);
  }
}

/** One photo at a time across the app: a second capture waits for the first to be ready. */
let chain: Promise<unknown> = Promise.resolve();
export function prepareInTurn<T>(work: () => Promise<T>): Promise<T> {
  const run = chain.then(work, work);
  chain = run.catch(() => undefined);
  return run;
}

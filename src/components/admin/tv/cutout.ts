/*
 * A person cut out of their photo, in the admin's own browser (11 Nov 2026): for the birthday
 * greeting, where the person stands in front of the frame as on the team's card. The photo never
 * leaves the browser for this: MediaPipe's image segmenter (Google, Apache-2.0) runs here; only its
 * program and its model are fetched, once, from the addresses below.
 * A photo that already has no background (a PNG from Canva) is used as it is. When the cut cannot
 * be made (no network for the model, no person found), the photo is kept whole and `problem` says why.
 */

/** The segmenter's program (the package's own files, by its exact version) and its model (hair, skin and clothes told from the background). */
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
/** The longest side the cut is made at: enough for a TV, light enough for a laptop. */
const EDGE = 1600;

export type Cutout = { file: File; cut: boolean; problem?: string };

/** How sure "not background" must be: below `from` it is gone, above `to` it is kept, between them the edge fades. */
export const cutoutAlpha = (background: number, from = 0.35, to = 0.65): number => {
  const share = Math.min(1, Math.max(0, (1 - background - from) / (to - from)));
  return Math.round(share * share * (3 - 2 * share) * 255);
};

/** The box around what is kept, in the mask's own pixels; null when next to nothing is. */
export function cutoutBox(alpha: Uint8ClampedArray, width: number, height: number): { left: number; top: number; right: number; bottom: number } | null {
  let left = width, top = height, right = -1, bottom = -1, kept = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (alpha[y * width + x] < 128) continue;
    kept += 1;
    if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
  }
  // A person fills a fair part of their photo: less than a twentieth kept is not one.
  return kept < width * height * 0.05 ? null : { left, top, right: right + 1, bottom: bottom + 1 };
}

const asBlob = (canvas: HTMLCanvasElement) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.92));

export async function cutOutPerson(file: File): Promise<Cutout> {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { return { file, cut: false, problem: "Berkas ini tidak bisa dibuka sebagai gambar." }; }
  const scale = Math.min(1, EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Already without a background: its corners are clear. Used as it is.
  const corners = [context.getImageData(0, 0, 1, 1), context.getImageData(width - 1, 0, 1, 1)].every(pixel => pixel.data[3] < 16);
  if (corners) return { file, cut: true };

  try {
    const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
    const segmenter = await ImageSegmenter.createFromOptions(await FilesetResolver.forVisionTasks(WASM), {
      baseOptions: { modelAssetPath: MODEL }, runningMode: "IMAGE", outputConfidenceMasks: true, outputCategoryMask: false,
    });
    const result = segmenter.segment(canvas);
    const background = result.confidenceMasks?.[0];
    if (!background) { segmenter.close(); return { file, cut: false, problem: "Orangnya tidak bisa dikenali di foto ini, jadi foto dipakai utuh." }; }
    const maskWidth = background.width, maskHeight = background.height;
    const sure = background.getAsFloat32Array();
    const mask = document.createElement("canvas");
    mask.width = maskWidth; mask.height = maskHeight;
    const pixels = new ImageData(maskWidth, maskHeight);
    const alpha = new Uint8ClampedArray(maskWidth * maskHeight);
    for (let index = 0; index < alpha.length; index += 1) { alpha[index] = cutoutAlpha(sure[index]); pixels.data[index * 4 + 3] = alpha[index]; }
    mask.getContext("2d")!.putImageData(pixels, 0, 0);
    result.close(); segmenter.close();

    const box = cutoutBox(alpha, maskWidth, maskHeight);
    if (!box) return { file, cut: false, problem: "Orangnya tidak bisa dikenali di foto ini, jadi foto dipakai utuh." };
    // The mask is small: drawn over the photo at the photo's size, smoothed, it keeps only the person.
    context.globalCompositeOperation = "destination-in";
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    context.drawImage(mask, 0, 0, width, height);
    context.globalCompositeOperation = "source-over";

    // Cut to the person, with a little air at the sides and above, so they fill the frame.
    const x = Math.max(0, Math.floor((box.left / maskWidth - 0.02) * width)), right = Math.min(width, Math.ceil((box.right / maskWidth + 0.02) * width));
    const y = Math.max(0, Math.floor((box.top / maskHeight - 0.02) * height)), bottom = Math.min(height, Math.ceil((box.bottom / maskHeight) * height));
    const out = document.createElement("canvas");
    out.width = right - x; out.height = bottom - y;
    out.getContext("2d")!.drawImage(canvas, x, y, out.width, out.height, 0, 0, out.width, out.height);
    const blob = await asBlob(out);
    if (!blob || blob.type !== "image/webp") return { file, cut: false, problem: "Browser ini belum bisa menyimpan foto tanpa latar, jadi foto dipakai utuh." };
    return { file: new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" }), cut: true };
  } catch {
    return { file, cut: false, problem: "Pemotong foto tidak bisa dimuat (periksa internet), jadi foto dipakai utuh. Coba unggah lagi nanti, atau unggah PNG tanpa latar." };
  }
}

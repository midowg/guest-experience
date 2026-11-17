"use client";

import type Tesseract from "tesseract.js";

/*
 * Catat dari foto (18 Nov 2026): reading a proof photo's text on the phone itself, with Tesseract
 * (tesseract.js, WebAssembly). The photo is not sent anywhere to be read. The engine and its English
 * model (about 6 to 8 MB, from the jsDelivr CDN at the versions in package.json) load on the first
 * use and stay in the browser's cache; one worker is kept for the visit.
 */

export type OcrStage = "load" | "read";
export type OcrProgress = { stage: OcrStage; progress: number };

let worker: Promise<Tesseract.Worker> | null = null;
let onProgress: ((progress: OcrProgress) => void) | null = null;

function engine(): Promise<Tesseract.Worker> {
  if (!worker) {
    worker = import("tesseract.js").then(async module => {
      const tesseract = ((module as unknown as { default?: typeof Tesseract }).default ?? module) as typeof Tesseract;
      const created = await tesseract.createWorker("eng", tesseract.OEM.LSTM_ONLY, {
        logger: message => onProgress?.({ stage: message.status === "recognizing text" ? "read" : "load", progress: typeof message.progress === "number" ? message.progress : 0 }),
      });
      // Screens scatter their text (a number here, its label there): read every piece, not paragraphs.
      await created.setParameters({ tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT });
      return created;
    });
    // A failed start (offline, blocked CDN) is tried again next time.
    worker.catch(() => { worker = null; });
  }
  return worker;
}

/**
 * The photo made easy to read: at most 2000 px on its long side (small ones doubled), grey, and
 * dark screens turned light (Tesseract reads dark text on a light ground best).
 */
async function prepare(file: Blob): Promise<HTMLCanvasElement | Blob> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  const bitmap = await createImageBitmap(file);
  const long = Math.max(bitmap.width, bitmap.height);
  const scale = long < 1000 ? 2 : Math.min(1, 2000 / long);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) { bitmap.close?.(); return file; }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  let sum = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const grey = 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
    pixels[index] = pixels[index + 1] = pixels[index + 2] = grey;
    sum += grey;
  }
  if (sum / (pixels.length / 4) < 110) for (let index = 0; index < pixels.length; index += 4) pixels[index] = pixels[index + 1] = pixels[index + 2] = 255 - pixels[index];
  context.putImageData(image, 0, 0);
  return canvas;
}

/** The text on a photo. Progress: "load" while the engine starts (the first time downloads it), then "read". */
export async function readPhotoText(file: Blob, progress?: (value: OcrProgress) => void): Promise<string> {
  onProgress = progress ?? null;
  try {
    progress?.({ stage: "load", progress: 0 });
    const [image, reader] = await Promise.all([prepare(file), engine()]);
    progress?.({ stage: "read", progress: 0 });
    const { data } = await reader.recognize(image);
    return data.text ?? "";
  } finally {
    onProgress = null;
  }
}

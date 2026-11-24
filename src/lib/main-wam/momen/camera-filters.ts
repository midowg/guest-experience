/*
 * The tones of the camera's event templates (Momen only; the Misi camera has none): soft, in WAM 2026's
 * colours (gold, deep blue). The frame, text and logo of each template are in camera-templates.ts; this file
 * holds only the colour tone each one gives the picture. One list holds the numbers; from it come the CSS `filter` of the live viewfinder, the same
 * filter drawn into the photo that is sent (canvas `ctx.filter`), and a pixel fallback with the equivalent
 * matrices for browsers whose canvas ignores `ctx.filter` (Safari before 18). Pure. "asli" is the default
 * every time the camera opens and changes nothing.
 */

export const CAMERA_FILTER_IDS = ["asli", "emas", "biru", "jaringan", "polaroid"] as const;
export type CameraFilterId = (typeof CAMERA_FILTER_IDS)[number];
export const DEFAULT_CAMERA_FILTER: CameraFilterId = "asli";

/** One filter: CSS filter functions in the fixed order sepia, hue (degrees), saturate, grayscale, contrast, brightness. */
export type FilterOps = { sepia?: number; hue?: number; saturate?: number; grayscale?: number; contrast?: number; brightness?: number };

export const CAMERA_FILTERS: Record<CameraFilterId, FilterOps> = {
  asli: {},
  emas: { sepia: 0.3, saturate: 1.2, contrast: 1.03, brightness: 1.05 },
  biru: { sepia: 0.3, hue: 175, saturate: 0.95, contrast: 1.05, brightness: 0.98 },
  jaringan: { sepia: 0.2, hue: 175, saturate: 0.9, contrast: 1.06, brightness: 0.96 },
  polaroid: { saturate: 0.95, contrast: 0.97, brightness: 1.04 },
};

export const isCameraFilter = (value: unknown): value is CameraFilterId => typeof value === "string" && (CAMERA_FILTER_IDS as readonly string[]).includes(value);

/** The CSS/canvas filter string of a filter ("none" for Asli). */
export function cssFilter(id: CameraFilterId): string {
  const o = CAMERA_FILTERS[id];
  const parts: string[] = [];
  if (o.sepia !== undefined) parts.push(`sepia(${o.sepia})`);
  if (o.hue !== undefined) parts.push(`hue-rotate(${o.hue}deg)`);
  if (o.saturate !== undefined) parts.push(`saturate(${o.saturate})`);
  if (o.grayscale !== undefined) parts.push(`grayscale(${o.grayscale})`);
  if (o.contrast !== undefined) parts.push(`contrast(${o.contrast})`);
  if (o.brightness !== undefined) parts.push(`brightness(${o.brightness})`);
  return parts.length ? parts.join(" ") : "none";
}

type Matrix = [number, number, number, number, number, number, number, number, number];
const mul = (a: Matrix, b: Matrix): Matrix => {
  const out = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return out as Matrix;
};

const sepiaM = (a: number): Matrix => { const s = 1 - a; return [0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s, 0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s, 0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s]; };
const grayM = (a: number): Matrix => { const s = 1 - a; return [0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s, 0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s, 0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s]; };
const satM = (s: number): Matrix => [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s];
const hueM = (deg: number): Matrix => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
};

/** The colour part (a 3x3 matrix) and the contrast and brightness of a filter, as the pixel fallback applies them. */
export function filterTransform(id: CameraFilterId): { matrix: Matrix; contrast: number; brightness: number } {
  const o = CAMERA_FILTERS[id];
  let m: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (o.sepia !== undefined) m = mul(sepiaM(o.sepia), m);
  if (o.hue !== undefined) m = mul(hueM(o.hue), m);
  if (o.saturate !== undefined) m = mul(satM(o.saturate), m);
  if (o.grayscale !== undefined) m = mul(grayM(o.grayscale), m);
  return { matrix: m, contrast: o.contrast ?? 1, brightness: o.brightness ?? 1 };
}

/** The fallback: the filter applied to RGBA pixels in place (alpha untouched). */
export function applyFilterToPixels(data: Uint8ClampedArray, id: CameraFilterId): void {
  if (id === "asli") return;
  const { matrix: m, contrast, brightness } = filterTransform(id);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mix = [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b];
    for (let k = 0; k < 3; k++) data[i + k] = ((mix[k] - 127.5) * contrast + 127.5) * brightness; // Uint8ClampedArray clamps
  }
}

/*
 * The photo filters of Momen's editor ("Periksa fotomu", KONTRAK §40; the Misi camera has none), apart from the sign (frame, words and mark:
 * camera-templates.ts): a filter only changes the colours of the picture, a sign only adds things on top. Asli, Cerah, Hangat, Sejuk, Pudar, Mono,
 * from the final prototype (`TF` and `TINT` in prototipe-wam.html). One list holds the recipes; from it come the CSS `filter` of the preview, the same
 * filter drawn into the photo that is sent (canvas `ctx.filter`), a pixel fallback with the same steps for browsers whose canvas ignores `ctx.filter`
 * (Safari before 18), and the thin colour layer two of the filters lay over the picture (Sejuk: brand blue; Pudar: white, it lifts the blacks).
 * Pure. "asli" is the default every time the editor opens and changes nothing.
 */

export const CAMERA_TONE_IDS = ["asli", "cerah", "hangat", "sejuk", "pudar", "mono"] as const;
export type CameraToneId = (typeof CAMERA_TONE_IDS)[number];
export const DEFAULT_CAMERA_TONE: CameraToneId = "asli";

/** One CSS filter function: its name and its amount (degrees for hue-rotate). */
export type FilterStep = readonly [name: "brightness" | "contrast" | "saturate" | "sepia" | "hue-rotate" | "grayscale", amount: number];

/** The recipes, each in the order the prototype writes them (the order is part of the look). */
export const CAMERA_TONES: Record<CameraToneId, readonly FilterStep[]> = {
  asli: [],
  cerah: [["brightness", 1.06], ["contrast", 1.05], ["saturate", 1.12]],
  hangat: [["sepia", 0.18], ["saturate", 1.08], ["hue-rotate", -8], ["brightness", 1.03]],
  sejuk: [["saturate", 0.95], ["hue-rotate", 8], ["brightness", 1.02], ["contrast", 1.03]],
  pudar: [["contrast", 0.9], ["saturate", 0.85], ["brightness", 1.06]],
  mono: [["grayscale", 1], ["contrast", 1.08]],
};

/** The thin layer over the filtered picture (before the sign): a colour and its opacity. The colours are the brand blue and white. */
export const TONE_TINTS: Partial<Record<CameraToneId, { rgb: readonly [number, number, number]; alpha: number }>> = {
  sejuk: { rgb: [47, 111, 235], alpha: 0.08 },
  pudar: { rgb: [255, 255, 255], alpha: 0.06 },
};

export const isCameraTone = (value: unknown): value is CameraToneId => typeof value === "string" && (CAMERA_TONE_IDS as readonly string[]).includes(value);
/** A remembered or sent id that is not a filter any more (the old Emas and Fajar) becomes Asli. */
export const toCameraTone = (value: unknown): CameraToneId => (isCameraTone(value) ? value : DEFAULT_CAMERA_TONE);

/** The CSS/canvas filter string of a tone ("none" for Asli). */
export function cssFilter(id: CameraToneId): string {
  const steps = CAMERA_TONES[id];
  return steps.length ? steps.map(([name, amount]) => `${name}(${name === "hue-rotate" ? `${amount}deg` : amount})`).join(" ") : "none";
}

/** The colour layer of a tone as a CSS colour ("rgba(47, 111, 235, 0.08)"), or null. */
export function toneTint(id: CameraToneId): string | null {
  const tint = TONE_TINTS[id];
  return tint ? `rgba(${tint.rgb[0]}, ${tint.rgb[1]}, ${tint.rgb[2]}, ${tint.alpha})` : null;
}

type Rgb = [number, number, number];
const matrix = (m: readonly number[], c: Rgb): Rgb => [m[0] * c[0] + m[1] * c[1] + m[2] * c[2], m[3] * c[0] + m[4] * c[1] + m[5] * c[2], m[6] * c[0] + m[7] * c[1] + m[8] * c[2]];
const clamp = (c: Rgb): Rgb => [Math.min(255, Math.max(0, c[0])), Math.min(255, Math.max(0, c[1])), Math.min(255, Math.max(0, c[2]))];

/** One CSS filter function on a pixel (0-255), as the Filter Effects spec writes it. */
function step([name, amount]: FilterStep, c: Rgb): Rgb {
  switch (name) {
    case "brightness": return [c[0] * amount, c[1] * amount, c[2] * amount];
    case "contrast": return [(c[0] - 127.5) * amount + 127.5, (c[1] - 127.5) * amount + 127.5, (c[2] - 127.5) * amount + 127.5];
    case "saturate": return matrix([0.213 + 0.787 * amount, 0.715 - 0.715 * amount, 0.072 - 0.072 * amount, 0.213 - 0.213 * amount, 0.715 + 0.285 * amount, 0.072 - 0.072 * amount, 0.213 - 0.213 * amount, 0.715 - 0.715 * amount, 0.072 + 0.928 * amount], c);
    case "sepia": { const s = 1 - amount; return matrix([0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s, 0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s, 0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s], c); }
    case "grayscale": { const s = 1 - amount; return matrix([0.2126 + 0.7874 * s, 0.7152 - 0.7152 * s, 0.0722 - 0.0722 * s, 0.2126 - 0.2126 * s, 0.7152 + 0.2848 * s, 0.0722 - 0.0722 * s, 0.2126 - 0.2126 * s, 0.7152 - 0.7152 * s, 0.0722 + 0.9278 * s], c); }
    case "hue-rotate": {
      const r = (amount * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
      return matrix([0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
        0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
        0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072], c);
    }
  }
}

/** The filter on one pixel (0-255 each): every step of the recipe in order, kept inside 0-255 after each, like the browser's own chain. */
export function filterPixel(id: CameraToneId, rgb: readonly [number, number, number]): [number, number, number] {
  let c: Rgb = [rgb[0], rgb[1], rgb[2]];
  for (const one of CAMERA_TONES[id]) c = clamp(step(one, c));
  return c;
}

/** The fallback: the filter applied to RGBA pixels in place (alpha untouched); the colour layer is drawn apart. */
export function applyFilterToPixels(data: Uint8ClampedArray, id: CameraToneId): void {
  if (id === "asli") return;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = filterPixel(id, [data[i], data[i + 1], data[i + 2]]);
    data[i] = r; data[i + 1] = g; data[i + 2] = b; // Uint8ClampedArray rounds
  }
}

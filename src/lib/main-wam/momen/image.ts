/*
 * The sizes of a Momen photo (RISET §2), made in the browser from one decoded picture, all JPEG
 * (Safari cannot write WebP from a canvas: it quietly writes PNG):
 *   besar  4:5, 1600 px on the long side, quality 0.8 → 0.7 → 0.6 until ≤ 500 KB, then 1280 px
 *          (the stack, a detail, the TV)
 *   kecil  4:5, 480 px, quality 0.72 (the gallery, the stack's first paint)
 *   ubin   160 × 160, the middle square, quality 0.7 (the Mozaik)
 * Every photo is cut to 4:5 around its middle (SPEC U04: what the viewfinder and the stack card
 * show is what is sent). Pure: the canvas work lives in the component (upload/compress.ts).
 */

/** Portrait 4:5, as the viewfinder and the stack card. */
export const MOMEN_ASPECT = 4 / 5;

export const LARGE_RULE = { sides: [1600, 1280], qualities: [0.8, 0.7, 0.6], bytes: 500 * 1024 } as const;
export const THUMB_RULE = { side: 480, quality: 0.72 } as const;
export const TILE_RULE = { side: 160, quality: 0.7 } as const;

export type Rect = { x: number; y: number; width: number; height: number };

/** The middle of a picture at the given aspect (width / height). */
export function centerCrop(width: number, height: number, aspect = MOMEN_ASPECT): Rect {
  if (width <= 0 || height <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  if (width / height > aspect) {
    const cut = Math.round(height * aspect);
    return { x: Math.floor((width - cut) / 2), y: 0, width: cut, height };
  }
  const cut = Math.round(width / aspect);
  return { x: 0, y: Math.floor((height - cut) / 2), width, height: cut };
}

/** A size whose long side is at most `side`, never larger than the picture. */
export function fitSide(width: number, height: number, side: number): { width: number; height: number } {
  const scale = Math.min(1, side / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Sizes to draw through when shrinking a lot: each step at most halves, so a 4000 px photo drawn
 * to 1600 px stays sharp in browsers whose smoothing only looks at neighbouring pixels. The last
 * step is the target itself.
 */
export function halvingSteps(from: { width: number; height: number }, to: { width: number; height: number }): { width: number; height: number }[] {
  const steps: { width: number; height: number }[] = [];
  let width = from.width, height = from.height;
  while (width / to.width > 2 && height / to.height > 2) {
    width = Math.round(width / 2); height = Math.round(height / 2);
    steps.push({ width, height });
  }
  steps.push({ width: to.width, height: to.height });
  return steps;
}

/** The middle square of a picture, for the tile. */
export function squareCrop(width: number, height: number): Rect {
  const side = Math.min(width, height);
  return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side };
}

/** The tries for the large copy, in order: each side with each quality. */
export function largeTries(): { side: number; quality: number }[] {
  return LARGE_RULE.sides.flatMap(side => LARGE_RULE.qualities.map(quality => ({ side, quality })));
}

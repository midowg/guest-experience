import type { Lang } from "@/lib/main-wam/i18n";

/*
 * The camera's signs (Momen only; the Misi camera has none): what is added on top of the photo, apart from its
 * colour tone (camera-filters.ts). Tanpa adds nothing; Simpel is one small line and a small mark; Emas, Jaringan
 * and Polaroid are frames for WAM 2026, each with the event's name and the Werkudara mark in the top-right corner.
 * A sign carries no tone: the photo is toned first and the sign is drawn over it. One pure
 * `templateLayout(id, width, height)` turns a sign into a list of drawing ops; the live viewfinder draws them
 * as an SVG (TemplateOverlay) and the photo that is sent draws the same list on its canvas
 * (camera-template-draw.ts), so what the person sees is what is sent. Everything is placed in a 400-unit-wide
 * design and scaled by the photo's width; text stays on the edges, never on the faces.
 * The colours live here (the kit's gold, deep blue, light blue), the one place of this feature.
 */

export const TEMPLATE_TITLE = "Werkudara Annual Meeting 2026";
/** Simpel's one line: "WAM 2026 · Kota Batu · 5–8 Jan 2027". */
export const SIMPLE_LINE = "WAM 2026 · Kota Batu · 5–8 Jan 2027";
export const TEMPLATE_DATE: Record<Lang, string> = { id: "5–8 Januari 2027 · Kota Batu", en: "5–8 January 2027 · Kota Batu" };
export const LOGO_SRC = "/werkudara-mark.png";
export const NET_SRC = "/wam/pegasus-jaringan-gelap.svg";
/** The mark's aspect (width / height) and the network art's (public/werkudara-mark.png 419x477, public/wam/pegasus-jaringan-gelap.svg 474x560). */
export const LOGO_ASPECT = 419 / 477;
export const NET_ASPECT = 474 / 560;
/** The shadow under text and mark on a photo. */
export const SHADOW = "#000000";
export const FONT_STACK = "\"Helvetica Neue\", Arial, sans-serif";

const GOLD = "#F5C542", NAVY = "#0B1638", BLUE = "#1551A0", CYAN = "#46D2FF", PAPER = "#FAF7F0", WHITE = "#FFFFFF", MUTED = "#4A5578";

export const SIGN_IDS = ["tanpa", "simpel", "emas", "jaringan", "polaroid"] as const;
export type SignId = (typeof SIGN_IDS)[number];
export const DEFAULT_SIGN: SignId = "tanpa";
export type TemplateId = SignId;
export const isSign = (value: unknown): value is SignId => typeof value === "string" && (SIGN_IDS as readonly string[]).includes(value);
export type TemplateOp =
  | { k: "rect"; x: number; y: number; w: number; h: number; fill: string; opacity?: number }
  /** A fade of one colour: strongest (a0) on the bottom edge for "up", on the top edge for "down", to a1 at the other. */
  | { k: "grad"; x: number; y: number; w: number; h: number; color: string; a0: number; a1: number; dir: "up" | "down" }
  | { k: "frame"; x: number; y: number; w: number; h: number; line: number; color: string; opacity?: number }
  | { k: "text"; text: string; x: number; y: number; size: number; weight: number; color: string; align: "start" | "middle" | "end"; ls: number; maxW: number; shadow?: boolean }
  | { k: "logo"; x: number; y: number; w: number; h: number; color: string; shadow?: boolean }
  | { k: "net"; x: number; y: number; w: number; h: number; opacity: number };

export type CameraTemplate = {
  id: TemplateId;
  /** The words printed on the photo (the title, or Simpel's line); none for Tanpa. */
  lines: string[];
  /** The mark's corner: always the top right. */
  logo: "top-right" | null;
};

export const CAMERA_TEMPLATES: CameraTemplate[] = SIGN_IDS.map(id => ({
  id,
  lines: id === "tanpa" ? [] : id === "simpel" ? [SIMPLE_LINE] : [TEMPLATE_TITLE.toUpperCase()],
  logo: id === "tanpa" ? null : "top-right",
}));

export const templateOf = (id: TemplateId): CameraTemplate => CAMERA_TEMPLATES.find(template => template.id === id)!;
export const hasTemplate = (id: TemplateId): boolean => id !== "tanpa";

/** "#RRGGBB" to [r, g, b] (0-255). */
export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const withAlpha = (hex: string, alpha: number): string => { const [r, g, b] = hexRgb(hex); return `rgba(${r}, ${g}, ${b}, ${alpha})`; };

/** The width of capital text (a safe estimate for bold sans capitals) so a line is made to fit before it is drawn. */
const CAP = 0.72;
const fit = (text: string, size: number, ls: number, maxW: number): number => Math.min(size, maxW / (text.length * (CAP + ls)));

/** The ops of a template on a photo of this size (the design is 400 wide; everything scales with the width). */
export function templateLayout(id: TemplateId, width: number, height: number, lang: Lang = "id"): TemplateOp[] {
  if (!hasTemplate(id)) return [];
  const s = width / 400;
  const W = width, H = height;
  const date = TEMPLATE_DATE[lang].toUpperCase();
  const text = (t: string, x: number, y: number, size: number, weight: number, color: string, align: "start" | "middle" | "end", ls: number, maxW: number, shadow = false): TemplateOp =>
    ({ k: "text", text: t, x, y, size: fit(t, size * s, ls, maxW), weight, color, align, ls, maxW, shadow });
  const logoAt = (margin: number, h: number, color: string, shadow: boolean, top = margin): TemplateOp => {
    const lw = h * s * LOGO_ASPECT;
    return { k: "logo", x: W - margin * s - lw, y: top * s, w: lw, h: h * s, color, shadow };
  };
  const title = TEMPLATE_TITLE.toUpperCase();

  if (id === "simpel") {
    const line = SIMPLE_LINE;
    return [
      { k: "grad", x: 0, y: H - 44 * s, w: W, h: 44 * s, color: NAVY, a0: 0.62, a1: 0, dir: "up" },
      { k: "grad", x: 0, y: 0, w: W, h: 64 * s, color: NAVY, a0: 0.34, a1: 0, dir: "down" },
      logoAt(14, 30, WHITE, true),
      text(line, 14 * s, H - 14 * s, 10.5, 600, WHITE, "start", 0.02, W - 28 * s, true),
    ];
  }

  if (id === "emas") return [
    { k: "grad", x: 0, y: 0, w: W, h: 100 * s, color: NAVY, a0: 0.5, a1: 0, dir: "down" },
    logoAt(16, 46, GOLD, true),
    { k: "rect", x: 0, y: H - 56 * s, w: W, h: 56 * s, fill: NAVY, opacity: 0.88 },
    { k: "rect", x: 0, y: H - 56 * s, w: W, h: 2.5 * s, fill: GOLD },
    text(title, W / 2, H - 31 * s, 14, 800, GOLD, "middle", 0.06, W - 28 * s),
    text(date, W / 2, H - 14 * s, 9.5, 600, WHITE, "middle", 0.1, W - 28 * s),
  ];

    if (id === "jaringan") {
    const nw = 260 * s;
    return [
      { k: "net", x: -56 * s, y: H - nw / NET_ASPECT + 36 * s, w: nw, h: nw / NET_ASPECT, opacity: 0.3 },
      { k: "grad", x: 0, y: 0, w: W, h: 100 * s, color: BLUE, a0: 0.5, a1: 0, dir: "down" },
      { k: "grad", x: 0, y: H - 112 * s, w: W, h: 112 * s, color: NAVY, a0: 0.82, a1: 0, dir: "up" },
      logoAt(16, 46, WHITE, true),
      { k: "rect", x: W / 2 - 15 * s, y: H - 62 * s, w: 30 * s, h: 2.5 * s, fill: CYAN },
      text(title, W / 2, H - 38 * s, 14, 800, WHITE, "middle", 0.06, W - 28 * s, true),
      text(date, W / 2, H - 20 * s, 9, 600, CYAN, "middle", 0.1, W - 28 * s, true),
    ];
  }

  // polaroid: a white mount; the mark in the mount's top right corner (in navy), the words in the thick bottom.
  const side = 18 * s, top = 44 * s, bottom = 88 * s;
  return [
    { k: "rect", x: 0, y: 0, w: W, h: top, fill: PAPER },
    { k: "rect", x: 0, y: H - bottom, w: W, h: bottom, fill: PAPER },
    { k: "rect", x: 0, y: top, w: side, h: H - top - bottom, fill: PAPER },
    { k: "rect", x: W - side, y: top, w: side, h: H - top - bottom, fill: PAPER },
    { k: "frame", x: side, y: top, w: W - 2 * side, h: H - top - bottom, line: 1 * s, color: NAVY, opacity: 0.18 },
    { k: "logo", x: W - side - 34 * s * LOGO_ASPECT, y: 5 * s, w: 34 * s * LOGO_ASPECT, h: 34 * s, color: NAVY },
    { k: "rect", x: W / 2 - 14 * s, y: H - 70 * s, w: 28 * s, h: 2.5 * s, fill: GOLD },
    text(title, W / 2, H - 46 * s, 15, 800, NAVY, "middle", 0.05, W - 40 * s),
    text(date, W / 2, H - 26 * s, 10, 600, MUTED, "middle", 0.1, W - 40 * s),
  ];
}

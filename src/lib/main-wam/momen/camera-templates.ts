import type { Lang } from "@/lib/main-wam/i18n";

/*
 * The signs of Momen's editor ("Periksa fotomu", KONTRAK §40; the Misi camera has none): what is added on top of the photo, apart from its filter
 * (camera-filters.ts). Tanpa adds nothing. Tanda, Label, Bingkai, Film, Poster, Polaroid and Jaringan are translated from the final prototype
 * (`tplSvg` in prototipe-wam.html), drawn in a 400 x 500 design with the event's data: WAM 2026, Shaping Tomorrow, 5–8 Januari 2027, Kota Batu, and the
 * date and time the photo was taken. A sign carries no filter: the photo is filtered first and the sign is drawn over it. One pure
 * `templateLayout(id, width, height)` turns a sign into a list of drawing ops; the preview draws them as an SVG (TemplateOverlay) and the photo that is
 * sent draws the same list on its canvas (camera-template-draw.ts), so what the person sees is what is sent. Everything is placed in the 400-wide design
 * and scaled by the photo's width. The colours live here (the kit's gold, deep blue and light blue, ink, paper, film orange), the one place of this feature.
 */

export const TEMPLATE_TITLE = "Werkudara Annual Meeting 2026";
export const EVENT_NAME = "WAM 2026";
export const EVENT_TAGLINE = "SHAPING TOMORROW";
export const EVENT_PLACE = "KOTA BATU";
/** The event's days, as the signs print them. */
export const EVENT_DAYS: Record<Lang, { short: string; long: string }> = { id: { short: "5–8 JAN 2027", long: "5–8 JANUARI 2027" }, en: { short: "5–8 JAN 2027", long: "5–8 JANUARY 2027" } };
export const LOGO_SRC = "/werkudara-mark.png";
export const NET_SRC = "/wam/pegasus-jaringan-gelap.svg";
/** The mark's aspect (width / height) and the network art's (public/werkudara-mark.png 419x477, public/wam/pegasus-jaringan-gelap.svg 474x560). */
export const LOGO_ASPECT = 419 / 477;
export const NET_ASPECT = 474 / 560;
/** The shadow under text and mark on a photo. */
export const SHADOW = "#000000";

/** The three voices of the signs: Barlow Condensed (display), Plus Jakarta Sans (sans) and a handwriting (script). */
export type FontKind = "display" | "sans" | "script";
/** For the SVG preview: the app's own font variables (set on the theme root), with the plain names behind them. */
export const FONT_CSS: Record<FontKind, string> = {
  display: "var(--mw-font-condensed, \"Barlow Condensed\"), \"Arial Narrow\", sans-serif",
  sans: "var(--mw-font-sans, \"Plus Jakarta Sans\"), Arial, sans-serif",
  script: "\"Segoe Script\", \"Bradley Hand\", \"Comic Sans MS\", cursive",
};
/** For the canvas when the app's font cannot be read: the same names. */
export const FONT_FALLBACK: Record<FontKind, string> = { display: "\"Barlow Condensed\", \"Arial Narrow\", sans-serif", sans: "\"Plus Jakarta Sans\", Arial, sans-serif", script: FONT_CSS.script };
/** The width of one capital in each voice, as a fraction of the size (a safe estimate), so a line is made to fit before it is drawn. */
const CAP: Record<FontKind, number> = { display: 0.5, sans: 0.74, script: 0.62 };

const GOLD = "#F5C542", NAVY = "#0B1638", CYAN = "#46D2FF", PAPER = "#F4F2EC", WHITE = "#FFFFFF", MUTED = "#4A5578", INK = "#050914", FILM = "#F5821F";

export const SIGN_IDS = ["tanpa", "tanda", "label", "bingkai", "film", "poster", "polaroid", "jaringan"] as const;
export type SignId = (typeof SIGN_IDS)[number];
export const DEFAULT_SIGN: SignId = "tanpa";
export type TemplateId = SignId;
export const isSign = (value: unknown): value is SignId => typeof value === "string" && (SIGN_IDS as readonly string[]).includes(value);
/** A remembered or sent id that is not a sign any more (the old Simpel, Emas) becomes Tanpa. */
export const toSign = (value: unknown): SignId => (isSign(value) ? value : DEFAULT_SIGN);

export type TemplateOp =
  /** A filled rectangle (rounded with `r`), with an optional outline that has its own opacity. */
  | { k: "rect"; x: number; y: number; w: number; h: number; fill: string; opacity?: number; r?: number; stroke?: { color: string; w: number; opacity: number } }
  /** A fade of one colour: strongest (a0) on the bottom edge for "up", on the top edge for "down", to a1 at the other. */
  | { k: "grad"; x: number; y: number; w: number; h: number; color: string; a0: number; a1: number; dir: "up" | "down" }
  | { k: "frame"; x: number; y: number; w: number; h: number; line: number; color: string; opacity?: number }
  /** An open line through points, with square ends (the corners of Bingkai). */
  | { k: "path"; points: [number, number][]; color: string; line: number }
  /** Text: `ls` is the letter spacing as a fraction of the size; `stretchW` stretches the glyphs to exactly that width; `rotate` turns it (degrees) around its start. */
  | { k: "text"; text: string; x: number; y: number; size: number; weight: number; color: string; align: "start" | "middle" | "end"; ls: number; maxW: number; font: FontKind; shadow?: boolean; opacity?: number; rotate?: number; stretchW?: number }
  | { k: "logo"; x: number; y: number; w: number; h: number; color: string; shadow?: boolean }
  | { k: "net"; x: number; y: number; w: number; h: number; opacity: number };

export type CameraTemplate = {
  id: TemplateId;
  /** The mark's place: none for Tanpa, Bingkai, Film and Poster; a corner for the others. */
  logo: "bottom-left" | "top-right" | "bottom-right" | null;
};

const LOGOS: Record<SignId, CameraTemplate["logo"]> = { tanpa: null, tanda: "bottom-left", label: null, bingkai: null, film: null, poster: null, polaroid: "bottom-right", jaringan: "top-right" };
export const CAMERA_TEMPLATES: CameraTemplate[] = SIGN_IDS.map(id => ({ id, logo: LOGOS[id] }));

export const templateOf = (id: TemplateId): CameraTemplate => CAMERA_TEMPLATES.find(template => template.id === id)!;
export const hasTemplate = (id: TemplateId): boolean => id !== "tanpa";

/** "#RRGGBB" to [r, g, b] (0-255). */
export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const withAlpha = (hex: string, alpha: number): string => { const [r, g, b] = hexRgb(hex); return `rgba(${r}, ${g}, ${b}, ${alpha})`; };

const MONTHS_SHORT: Record<Lang, string[]> = {
  id: ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"],
  en: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
};
const MONTHS_LONG: Record<Lang, string[]> = {
  id: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** When the photo was taken, as the signs print it (the event's own clock, WIB): "6 JAN 2027", "10.02", "6 Januari 2027", "06 01 '27". */
export function photoStamp(taken: Date | string, lang: Lang = "id"): { short: string; time: string; long: string; film: string } {
  const date = typeof taken === "string" ? new Date(taken) : taken;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  const day = get("day"), month = get("month") - 1, year = get("year");
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    short: `${day} ${MONTHS_SHORT[lang][month]} ${year}`,
    time: `${pad(get("hour"))}.${pad(get("minute"))}`,
    long: `${day} ${MONTHS_LONG[lang][month]} ${year}`,
    film: `${pad(day)} ${pad(month + 1)} '${pad(year % 100)}`,
  };
}

/** The ops of a template on a photo of this size (the design is 400 wide; everything scales with the width). `taken` = when the photo was taken. */
export function templateLayout(id: TemplateId, width: number, height: number, lang: Lang = "id", taken: Date | string = new Date()): TemplateOp[] {
  if (!hasTemplate(id)) return [];
  const s = width / 400;
  const W = 400, H = height / s; // the design's own units: 400 wide, 500 tall for a 4:5 photo
  const stamp = photoStamp(taken, lang);
  const days = EVENT_DAYS[lang];
  const rect = (x: number, y: number, w: number, h: number, fill: string, extra: { opacity?: number; r?: number; stroke?: { color: string; w: number; opacity: number } } = {}): TemplateOp =>
    ({ k: "rect", x: x * s, y: y * s, w: w * s, h: h * s, fill, opacity: extra.opacity, r: extra.r === undefined ? undefined : extra.r * s, stroke: extra.stroke && { ...extra.stroke, w: extra.stroke.w * s } });
  const scrim = (y: number, h: number, a: number): TemplateOp => ({ k: "grad", x: 0, y: y * s, w: width, h: h * s, color: NAVY, a0: a, a1: 0, dir: "up" });
  const text = (t: string, x: number, y: number, size: number, weight: number, color: string, align: "start" | "middle" | "end", lsPx: number, font: FontKind,
    extra: { shadow?: boolean; opacity?: number; rotate?: number; stretchW?: number; maxW?: number } = {}): TemplateOp => {
    const room = extra.maxW ?? (align === "start" ? W - x - 12 : align === "end" ? x - 12 : Math.min(x, W - x) * 2 - 12);
    const ls = lsPx / size;
    const fitted = Math.min(size, room / (Math.max(1, [...t].length) * (CAP[font] + ls)));
    return { k: "text", text: t, x: x * s, y: y * s, size: (extra.stretchW ? size : fitted) * s, weight, color, align, ls, maxW: room * s, font, shadow: extra.shadow, opacity: extra.opacity, rotate: extra.rotate, stretchW: extra.stretchW === undefined ? undefined : extra.stretchW * s };
  };
  const logo = (x: number, y: number, h: number, color: string, shadow: boolean): TemplateOp => ({ k: "logo", x: x * s, y: y * s, w: h * s * LOGO_ASPECT, h: h * s, color, shadow });

  switch (id) {
    case "tanpa": return [];
    case "tanda": return [
      scrim(H - 120, 120, 0.55),
      rect(20, H - 64, 3, 40, GOLD, { r: 1.5 }),
      logo(32, H - 64, 38, WHITE, true),
      text(EVENT_NAME, 74, H - 38, 26, 800, WHITE, "start", 1.5, "display", { shadow: true }),
      text(`${stamp.short} · ${stamp.time}`, 75, H - 22, 9.5, 700, WHITE, "start", 1.2, "sans", { shadow: true, opacity: 0.9 }),
    ];
    case "label": return [
      scrim(H - 170, 170, 0.5),
      rect(16, H - 104, W - 32, 80, NAVY, { opacity: 0.62, r: 14, stroke: { color: WHITE, w: 1, opacity: 0.22 } }),
      rect(16, H - 104, 5, 80, GOLD, { r: 2.5 }),
      text(EVENT_TAGLINE, 36, H - 82, 10, 800, GOLD, "start", 2.6, "sans", { maxW: 190 }),
      text(EVENT_NAME, 35, H - 46, 40, 800, WHITE, "start", 1, "display", { maxW: 190 }),
      text(stamp.short, W - 32, H - 62, 12.5, 800, WHITE, "end", 1, "sans", { maxW: 150 }),
      text(EVENT_PLACE, W - 32, H - 46, 10, 700, CYAN, "end", 1.8, "sans", { maxW: 150 }),
    ];
    case "bingkai": {
      const i = 14, L = 30;
      const corner = (x: number, y: number, dx: number, dy: number): TemplateOp => ({ k: "path", points: [[x * s, (y + dy * L) * s], [x * s, y * s], [(x + dx * L) * s, y * s]], color: GOLD, line: 3.5 * s });
      return [
        { k: "frame", x: i * s, y: i * s, w: (W - 2 * i) * s, h: (H - 2 * i) * s, line: 1.2 * s, color: WHITE, opacity: 0.8 },
        corner(i, i, 1, 1), corner(W - i, i, -1, 1), corner(i, H - i, 1, -1), corner(W - i, H - i, -1, -1),
        rect(W / 2 - 128, H - i - 11, 256, 22, NAVY, { opacity: 0.85, r: 11 }),
        text(`${EVENT_NAME} · ${EVENT_PLACE} · ${stamp.short}`, W / 2, H - i + 3.5, 9.5, 700, WHITE, "middle", 1.4, "sans", { maxW: 240 }),
      ];
    }
    case "film": {
      const ops: TemplateOp[] = [rect(0, 0, 22, H, INK), rect(W - 22, 0, 22, H, INK), rect(0, 0, W, 8, INK), rect(0, H - 34, W, 34, INK)];
      for (let y = 10; y < H; y += 24) ops.push(rect(6, y, 9, 13, PAPER, { opacity: 0.9, r: 3 }), rect(W - 15, y, 9, 13, PAPER, { opacity: 0.9, r: 3 }));
      ops.push(
        text("▶ 12A", 30, H - 12, 15, 700, FILM, "start", 1.5, "display", { maxW: 90 }),
        text("WAM 26", W / 2, H - 12, 15, 700, FILM, "middle", 3, "display", { maxW: 120 }),
        text(stamp.film, W - 30, H - 12, 15, 700, FILM, "end", 1.5, "display", { maxW: 110 }),
      );
      return ops;
    }
    case "poster": return [
      scrim(H - 290, 290, 0.78),
      text(EVENT_NAME, 22, 38, 11, 800, WHITE, "start", 4, "sans", { shadow: true, maxW: 170 }),
      text(`${EVENT_PLACE} · ${days.short}`, W - 22, 38, 9.5, 700, WHITE, "end", 1.6, "sans", { shadow: true, maxW: 190 }),
      rect(22, H - 236, 64, 4, GOLD),
      text("SHAPING", 20, H - 128, 112, 800, WHITE, "start", 0, "display", { opacity: 0.9, stretchW: 360 }),
      text("TOMORROW", 20, H - 36, 100, 800, WHITE, "start", 0, "display", { opacity: 0.9, stretchW: 360 }),
    ];
    case "polaroid": return [
      rect(0, 0, W, 20, PAPER), rect(0, H - 92, W, 92, PAPER), rect(0, 20, 20, H - 112, PAPER), rect(W - 20, 20, 20, H - 112, PAPER),
      { k: "frame", x: 20 * s, y: 20 * s, w: (W - 40) * s, h: (H - 112) * s, line: 1 * s, color: NAVY, opacity: 0.15 },
      text(`${EVENT_NAME}, Kota Batu`, 28, H - 50, 27, 500, NAVY, "start", 0, "script", { rotate: -2, maxW: 280 }),
      text(stamp.long, 30, H - 24, 11.5, 700, MUTED, "start", 0.8, "sans", { maxW: 260 }),
      logo(W - 62, H - 70, 36, NAVY, false),
    ];
    case "jaringan": return [
      { k: "net", x: (W - 215) * s, y: (H - 285) * s, w: 250 * s, h: 295 * s, opacity: 0.24 },
      scrim(H - 130, 130, 0.72),
      rect(20, H - 66, 26, 3, CYAN),
      text(TEMPLATE_TITLE.toUpperCase(), 20, H - 40, 12, 800, WHITE, "start", 1.6, "sans", { shadow: true }),
      text(`${EVENT_PLACE} · ${days.long}`, 20, H - 22, 9.5, 700, CYAN, "start", 1.6, "sans", { shadow: true }),
      logo(W - 52, 16, 36, WHITE, true),
    ];
  }
}

/*
 * Main WAM's theme slots (keputusan 5.2, BRIEF_TIM): the event's colours, the display face and the KV
 * images live in one set of values that an admin can change later, without touching a component.
 * Everything else (neutrals, semantic colours, type, spacing, radius, elevation, motion) is fixed in
 * theme.module.css, straight from DESIGN_SYSTEM.md v1 and prototipe/wam.css.
 *
 * Values may come from the database, so nothing is written as it is: colours must be #RGB or
 * #RRGGBB, every text pair must keep a contrast of at least 4.5:1 (WCAG 1.4.3) or the whole group
 * falls back to the neutral default, image addresses must be https or a path on this site, and the
 * display face must be one of the faces this app loads (DISPLAY_FONTS).
 */

/** The neutral theme of DESIGN_SYSTEM.md (§1.2 brand, §1.5 acara). */
export const DEFAULT_THEME = {
  primary: "#2F6FEB",
  primaryStrong: "#1D4ED8",
  onPrimary: "#FFFFFF",
  primaryContainer: "#E3ECFD",
  onPrimaryContainer: "#1D4ED8",
  accent: "#1E3A5F",
  onAccent: "#FFFFFF",
  onAccent2: "#C9D6E8",
  accentContainer: "#E6EDF5",
  onAccentContainer: "#1E3A5F",
} as const;

export type ThemeColors = { -readonly [K in keyof typeof DEFAULT_THEME]: string };

/** Display faces the app loads (font.ts). A theme names one by key, never by a free font-family. */
export const DISPLAY_FONTS = ["plus-jakarta-sans"] as const;
export type DisplayFont = (typeof DISPLAY_FONTS)[number];

/** Image slots of the KV. `icon` feeds the manifest and is not a CSS value. */
export type ThemeImages = {
  /** Splash and login background. */
  splash?: string | null;
  /** The pattern behind Beranda's header. */
  homeHeader?: string | null;
  /** A repeating pattern for empty areas (optional). */
  pattern?: string | null;
  /** The Mozaik letters (mask or picture). */
  mosaic?: string | null;
  /** App icon for the manifest (not written to CSS). */
  icon?: string | null;
};

/**
 * What the theme reader (agen fondasi) hands to <MainWamTheme>. Every field is optional: a missing
 * or rejected value keeps the neutral default.
 */
export type MainWamThemeInput = Partial<Record<keyof ThemeColors, string | null>> & {
  displayFont?: string | null;
  images?: ThemeImages | null;
};

export type ResolvedTheme = {
  colors: ThemeColors;
  displayFont: DisplayFont;
  images: { splash: string | null; homeHeader: string | null; pattern: string | null; mosaic: string | null; icon: string | null };
  /** Why a value was not used, for a console note in development and for the admin preview. */
  warnings: string[];
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#abc" or "#AABBCC" as "#AABBCC"; anything else null. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!HEX.test(text)) return null;
  const hex = text.length === 4 ? `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}` : text;
  return hex.toUpperCase();
}

/** WCAG 2.x relative luminance of #RRGGBB. */
export function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio of two #RRGGBB colours (1–21). */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Text on a colour: white or the app's darkest text, whichever reads better. */
export function readableOn(background: string): string {
  return contrast("#FFFFFF", background) >= contrast("#111827", background) ? "#FFFFFF" : "#111827";
}

const TEXT_CONTRAST = 4.5;
const SURFACE = "#FFFFFF";
const BG = "#F6F7F9";

/**
 * Image address for CSS url(): https anywhere, or a path on this site. Quotes, brackets, spaces and
 * backslashes are refused, so the value cannot leave url("…").
 */
export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || /["'()\\\s<>]/.test(text)) return null;
  if (text.startsWith("/") && !text.startsWith("//")) return text;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

type Group = { keys: (keyof ThemeColors)[]; pairs: [keyof ThemeColors | "surface" | "bg", keyof ThemeColors | "surface" | "bg", number][]; name: string };

/** Each group is taken whole or not at all, so a half-changed theme never mixes two looks. */
const GROUPS: Group[] = [
  {
    name: "warna utama",
    keys: ["primary", "primaryStrong", "onPrimary", "primaryContainer", "onPrimaryContainer"],
    pairs: [["onPrimary", "primary", TEXT_CONTRAST], ["primaryStrong", "surface", TEXT_CONTRAST], ["primaryStrong", "bg", TEXT_CONTRAST],
      ["onPrimaryContainer", "primaryContainer", TEXT_CONTRAST], ["primary", "surface", 3]],
  },
  {
    name: "aksen acara",
    keys: ["accent", "onAccent", "onAccent2", "accentContainer", "onAccentContainer"],
    pairs: [["onAccent", "accent", TEXT_CONTRAST], ["onAccent2", "accent", TEXT_CONTRAST], ["onAccentContainer", "accentContainer", TEXT_CONTRAST]],
  },
];

/**
 * The theme to draw: the neutral default with the admin's values laid over it where they are valid
 * and readable. Never throws.
 */
export function resolveTheme(input?: MainWamThemeInput | null): ResolvedTheme {
  const warnings: string[] = [];
  const colors: ThemeColors = { ...DEFAULT_THEME };
  for (const group of GROUPS) {
    const given = group.keys.filter(key => input?.[key] != null && input[key] !== "");
    if (given.length === 0) continue;
    const next: ThemeColors = { ...colors };
    let valid = true;
    for (const key of given) {
      const hex = normalizeHex(input?.[key]);
      if (!hex) { warnings.push(`${key}: bukan warna hex (#RRGGBB)`); valid = false; continue; }
      next[key] = hex;
    }
    // Only the main colour given: its text follows it.
    if (valid && group.keys.includes("accent") && input?.accent && !input.onAccent) next.onAccent = readableOn(next.accent);
    if (valid && group.keys.includes("accent") && input?.accent && !input.onAccent2) next.onAccent2 = next.onAccent;
    if (valid && group.keys.includes("primary") && input?.primary && !input.onPrimary) next.onPrimary = readableOn(next.primary);
    if (valid) {
      const read = (key: keyof ThemeColors | "surface" | "bg") => (key === "surface" ? SURFACE : key === "bg" ? BG : next[key]);
      for (const [front, back, minimum] of group.pairs) {
        const ratio = contrast(read(front), read(back));
        if (ratio < minimum) { warnings.push(`${group.name}: ${front} di ${back} kontras ${ratio.toFixed(2)} (minimal ${minimum})`); valid = false; }
      }
    }
    if (valid) Object.assign(colors, next);
    else warnings.push(`${group.name}: memakai warna bawaan`);
  }

  let displayFont: DisplayFont = DISPLAY_FONTS[0];
  if (input?.displayFont) {
    if ((DISPLAY_FONTS as readonly string[]).includes(input.displayFont)) displayFont = input.displayFont as DisplayFont;
    else warnings.push(`displayFont: "${input.displayFont}" belum dimuat aplikasi`);
  }

  const image = (key: keyof ThemeImages) => {
    const raw = input?.images?.[key];
    if (raw == null || raw === "") return null;
    const url = safeImageUrl(raw);
    if (!url) warnings.push(`images.${key}: alamat gambar ditolak`);
    return url;
  };
  const images = { splash: image("splash"), homeHeader: image("homeHeader"), pattern: image("pattern"), mosaic: image("mosaic"), icon: image("icon") };
  return { colors, displayFont, images, warnings };
}

const COLOR_VARS: Record<keyof ThemeColors, string> = {
  primary: "--mw-kv-primary",
  primaryStrong: "--mw-kv-primary-strong",
  onPrimary: "--mw-kv-on-primary",
  primaryContainer: "--mw-kv-primary-container",
  onPrimaryContainer: "--mw-kv-on-primary-container",
  accent: "--mw-kv-accent",
  onAccent: "--mw-kv-on-accent",
  onAccent2: "--mw-kv-on-accent-2",
  accentContainer: "--mw-kv-accent-container",
  onAccentContainer: "--mw-kv-on-accent-container",
};
const IMAGE_VARS = { splash: "--mw-image-splash", homeHeader: "--mw-image-home-header", pattern: "--mw-image-pattern", mosaic: "--mw-image-mosaic" } as const;

/**
 * The CSS custom properties <MainWamTheme> writes on its root: only the values that differ from the
 * default (the default lives in theme.module.css), so the neutral theme writes nothing. The light
 * tokens read these slots (--mw-accent: var(--mw-kv-accent, #1E3A5F)); dark mode keeps its own.
 */
export function themeVars(theme: ResolvedTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of Object.keys(COLOR_VARS) as (keyof ThemeColors)[]) {
    if (theme.colors[key] !== DEFAULT_THEME[key]) vars[COLOR_VARS[key]] = theme.colors[key];
  }
  for (const key of Object.keys(IMAGE_VARS) as (keyof typeof IMAGE_VARS)[]) {
    const url = theme.images[key];
    if (url) vars[IMAGE_VARS[key]] = `url("${url}")`;
  }
  return vars;
}

/**
 * The page behind the app in each mode (theme.module.css --mw-bg; the camera, dark in both, is --mw-camera).
 * Fixed, not a theme slot: the body's colour (MainWamTheme) and the phone's status bar
 * (theme-color, mainWamThemeColor) both read it, so the bar and the page are one surface.
 */
export const PAGE_COLORS = { light: "#F6F7F9", dark: "#0E1116", camera: "#111827" } as const;

/**
 * `theme-color` for the phone's status and address bar (Next's Viewport.themeColor), one entry per
 * device scheme, in the mode the app is drawn in: light everywhere for "light", dark everywhere for
 * "dark" (whatever the phone is set to), and each phone's own for "system".
 */
export function mainWamThemeColor(mode: "light" | "dark" | "system" = "system"): { media: string; color: string }[] {
  const on = (dark: boolean) => (mode === "dark" || (mode === "system" && dark) ? PAGE_COLORS.dark : PAGE_COLORS.light);
  return [
    { media: "(prefers-color-scheme: light)", color: on(false) },
    { media: "(prefers-color-scheme: dark)", color: on(true) },
  ];
}

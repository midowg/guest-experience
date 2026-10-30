import type { CSSProperties } from "react";
import type { EventTheme, ThemeKey } from "./types";

/**
 * Every value a theme may change. Anything absent here — layout, order, button size, text size,
 * the photo scrim's presence — is locked across themes on purpose. The defaults in
 * styles/tokens.css are the Werkudara theme, so that theme sets nothing and stays pixel-identical.
 */
export type ThemeTokens = {
  background: string; surface: string; soft: string; border: string;
  text: string; heading: string; caption: string; danger: string;
  primary: string; primaryHover: string; onPrimary: string;
  hero: string; onHero: string; heroAccent: string; scrimRgb: string;
  fontHeading: string; headingWeight: number;
};

export type ThemeDefinition = { key: ThemeKey; name: string; description: string; suggestedFor: string; tokens: ThemeTokens };

const werkudara: ThemeTokens = {
  background: "#ffffff", surface: "#efefef", soft: "#c3e6f5", border: "#c3e6f5",
  text: "#484443", heading: "#1551a0", caption: "#6c6765", danger: "#9a273d",
  primary: "#1551a0", primaryHover: "#306fb6", onPrimary: "#ffffff",
  hero: "#1551a0", onHero: "#ffffff", heroAccent: "#c3e6f5", scrimRgb: "10, 32, 62",
  fontHeading: "'Nunito', system-ui, sans-serif", headingWeight: 800,
};

export const themes: ThemeDefinition[] = [
  { key: "werkudara", name: "Werkudara", description: "Biru brand, bersih dan tenang.", suggestedFor: "Welcome, rapat", tokens: werkudara },
  { key: "nenek", name: "Pulang ke Rumah Nenek", description: "Hangat: kayu, krem, dan huruf berkait.", suggestedFor: "Kunjungan bertema keakraban", tokens: {
    background: "#fbf6ee", surface: "#f1e6d6", soft: "#f1e6d6", border: "#e2d3be",
    text: "#2b211a", heading: "#7a4b2a", caption: "#6b5848", danger: "#8a2433",
    primary: "#7a4b2a", primaryHover: "#5e3a20", onPrimary: "#ffffff",
    hero: "#7a4b2a", onHero: "#fbf6ee", heroAccent: "#f1e6d6", scrimRgb: "48, 28, 14",
    fontHeading: "'Lora', serif", headingWeight: 600,
  } },
  { key: "gala", name: "Malam Apresiasi", description: "Gelap dan emas untuk malam yang istimewa.", suggestedFor: "Gala dinner", tokens: {
    background: "#111a2e", surface: "#1b2742", soft: "#1b2742", border: "#2c3a5a",
    text: "#f4efe3", heading: "#e9d6a8", caption: "#b4bbcc", danger: "#f2a0ae",
    primary: "#c9a35b", primaryHover: "#dbb977", onPrimary: "#111a2e",
    hero: "#0b1426", onHero: "#f4efe3", heroAccent: "#c9a35b", scrimRgb: "6, 12, 26",
    fontHeading: "'Playfair Display', serif", headingWeight: 600,
  } },
  { key: "khidmat", name: "Khidmat", description: "Hijau tua dan krem, tenang dan sederhana.", suggestedFor: "Nyadran, acara religi", tokens: {
    background: "#f6f3ea", surface: "#e6e4d3", soft: "#e6e4d3", border: "#d5d2bf",
    text: "#22261f", heading: "#2f4a3a", caption: "#5d6157", danger: "#8a2433",
    primary: "#2f4a3a", primaryHover: "#22382b", onPrimary: "#ffffff",
    hero: "#2f4a3a", onHero: "#f6f3ea", heroAccent: "#e6e4d3", scrimRgb: "20, 32, 25",
    fontHeading: "'Cormorant Garamond', serif", headingWeight: 600,
  } },
  { key: "segar", name: "Segar", description: "Ramah dan cerah, hijau segar.", suggestedFor: "CSR, kegiatan komunitas", tokens: {
    background: "#ffffff", surface: "#eaf6ef", soft: "#eaf6ef", border: "#cfe7d9",
    text: "#1f2a24", heading: "#22684a", caption: "#56625b", danger: "#9a273d",
    primary: "#22684a", primaryHover: "#1a5239", onPrimary: "#ffffff",
    hero: "#22684a", onHero: "#ffffff", heroAccent: "#c9ebd8", scrimRgb: "12, 40, 28",
    fontHeading: "'Nunito', sans-serif", headingWeight: 700,
  } },
  { key: "rempah", name: "Rempah", description: "Krem, hijau tua, dan emas; judul berkait.", suggestedFor: "Festival, kuliner, budaya", tokens: {
    background: "#fbf7ef", surface: "#f3ead8", soft: "#f3ead8", border: "#e3cfa3",
    text: "#1f2a24", heading: "#0f4a3a", caption: "#5d6157", danger: "#8a2433",
    primary: "#0f4a3a", primaryHover: "#0a3a2d", onPrimary: "#ffffff",
    hero: "#0f4a3a", onHero: "#fbf7ef", heroAccent: "#c9922b", scrimRgb: "10, 40, 30",
    fontHeading: "'Playfair Display', serif", headingWeight: 600,
  } },
  { key: "berbagi", name: "Berbagi", description: "Hangat: hijau toska, krem, dan jingga.", suggestedFor: "Friday Sharing, donasi", tokens: {
    background: "#fffaf4", surface: "#fdf0e2", soft: "#fcebd8", border: "#f1d6b8",
    text: "#2b2420", heading: "#0b5c57", caption: "#6a5a4e", danger: "#9a273d",
    primary: "#0b5c57", primaryHover: "#084642", onPrimary: "#ffffff",
    hero: "#0b5c57", onHero: "#ffffff", heroAccent: "#f6a04d", scrimRgb: "8, 42, 40",
    fontHeading: "'Nunito', sans-serif", headingWeight: 800,
  } },
  // From the Surya Madistrindo handbook (Sesarengan Lumampah): navy sky and headings, cream pages,
  // gold lines, and a deeper brick red on buttons and links: the client's brand red (#E12B27)
  // read too loud on a page (revision 30 Oct), so this is its darker, calmer shade.
  { key: "keraton", name: "Keraton", description: "Merah bata, biru malam, krem, dan garis emas; judul berkait.", suggestedFor: "Trip budaya, handbook peserta", tokens: {
    background: "#fffdf8", surface: "#f5f0e7", soft: "#f5f0e7", border: "#e4cfc8",
    text: "#30292a", heading: "#1b2d55", caption: "#75686a", danger: "#9a273d",
    primary: "#b8231f", primaryHover: "#961b18", onPrimary: "#ffffff",
    hero: "#1b2d55", onHero: "#fffdf8", heroAccent: "#dabb88", scrimRgb: "12, 22, 46",
    fontHeading: "'EB Garamond', serif", headingWeight: 600,
  } },
];

export function themeDefinition(key: ThemeKey): ThemeDefinition {
  return themes.find(theme => theme.key === key) ?? themes[0];
}

/** Inline custom properties on the guest root; children inherit them through the cascade. */
export function themeStyle(theme: EventTheme | undefined): CSSProperties {
  const definition = themeDefinition(theme?.key ?? "werkudara");
  const t = definition.tokens;
  const vars: Record<string, string | number> = theme?.corners === "soft" ? { "--radius": "12px" } : {};
  if (definition.key === "werkudara") return vars as CSSProperties;
  return {
    ...vars,
    "--color-background": t.background, "--color-surface": t.surface, "--color-soft": t.soft, "--color-border": t.border,
    "--color-text": t.text, "--color-muted": t.text, "--color-heading": t.heading, "--color-caption": t.caption, "--color-danger": t.danger,
    "--color-primary": t.primary, "--color-primary-hover": t.primaryHover, "--color-on-primary": t.onPrimary, "--color-focus": t.primary,
    "--color-hero": t.hero, "--color-on-hero": t.onHero, "--color-hero-accent": t.heroAccent, "--scrim-rgb": t.scrimRgb,
    "--font-heading": t.fontHeading, "--heading-weight": t.headingWeight,
  } as CSSProperties;
}

/** WCAG 2.x relative luminance contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

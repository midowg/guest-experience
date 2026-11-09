import { PRA_WAM_PATH } from "@/lib/routes";

/*
 * WAM's look comes in two parts (9 Nov 2026):
 * - the theme (WamLook), one for the whole app, picked by an admin in Admin WAM → Tema aplikasi:
 *   "Dream Out Loud" (Pra WAM 2026: night sky, lavender, gold; the default) or "Werkudara" (the
 *   company blue). Each theme has a light and a dark mode.
 * - the mode (WamTheme), each person's own in Pengaturan → Tampilan: Gelap (the default, since Pra
 *   WAM's theme starts from a dream at night), Terang, or Ikuti perangkat.
 */

/** The person's choice of light or dark, kept in a first-party cookie so the first paint is right. */
export const WAM_THEME_COOKIE = "wam_theme";
export const WAM_THEMES = ["light", "dark", "system"] as const;
export type WamTheme = (typeof WAM_THEMES)[number];

/** The app's theme, set by an admin for everyone. */
export const WAM_LOOKS = ["dream", "werkudara"] as const;
export type WamLook = (typeof WAM_LOOKS)[number];
export const DEFAULT_WAM_LOOK: WamLook = "dream";

export const WAM_LOOK_INFO: Record<WamLook, { label: string; description: string }> = {
  dream: { label: "Dream Out Loud", description: "Tema Pra WAM 2026: langit malam, lavender, dan emas, judul berhuruf serif." },
  werkudara: { label: "Werkudara", description: "Biru Werkudara dengan aksen kuning, tampilan WAM sebelumnya." },
};

const ONE_YEAR = 60 * 60 * 24 * 365;
/** The app's page colour and the browser bar colour, per theme and mode. */
export const WAM_THEME_COLORS: Record<WamLook, Record<"light" | "dark", { page: string; bar: string }>> = {
  dream: { light: { page: "#FBF7EE", bar: "#FBF7EE" }, dark: { page: "#0A0F2E", bar: "#0A0F2E" } },
  werkudara: { light: { page: "#F5F7FA", bar: "#F5F7FA" }, dark: { page: "#0E1117", bar: "#0E1117" } },
};

/** Anything unknown or missing is "dark": the app starts at night; light is the person's pick. */
export function parseWamTheme(value: string | null | undefined): WamTheme {
  return (WAM_THEMES as readonly string[]).includes(value ?? "") ? value as WamTheme : "dark";
}

/** Anything unknown or missing is the default theme. */
export function parseWamLook(value: string | null | undefined): WamLook {
  return (WAM_LOOKS as readonly string[]).includes(value ?? "") ? value as WamLook : DEFAULT_WAM_LOOK;
}

/** The look a choice resolves to, given whether the device itself is dark. */
export function resolveWamTheme(theme: WamTheme, deviceDark: boolean): "light" | "dark" {
  return theme === "system" ? (deviceDark ? "dark" : "light") : theme;
}

/** The document.cookie string that stores a choice for a year, for WAM's pages only. */
export function wamThemeCookie(theme: WamTheme, secure: boolean): string {
  return `${WAM_THEME_COOKIE}=${theme}; Path=${PRA_WAM_PATH}; Max-Age=${ONE_YEAR}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** The body rules that paint behind WAM from the first paint, for the active theme. */
export function wamBodyStyle(look: WamLook): string {
  const colors = WAM_THEME_COLORS[look];
  return `body{background:${colors.light.page};color-scheme:light}`
    + `body:has([data-wam-theme="dark"]){background:${colors.dark.page};color-scheme:dark}`
    + `@media (prefers-color-scheme:dark){body:has([data-wam-theme="system"]){background:${colors.dark.page};color-scheme:dark}}`;
}

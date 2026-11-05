import { PRA_WAM_PATH } from "@/lib/routes";

/** The person's choice of light or dark, kept in a first-party cookie so the first paint is right. */
export const WAM_THEME_COOKIE = "wam_theme";
export const WAM_THEMES = ["light", "dark", "system"] as const;
export type WamTheme = (typeof WAM_THEMES)[number];

const ONE_YEAR = 60 * 60 * 24 * 365;
/** The app's page colour and the browser bar colour, per look. */
export const WAM_THEME_COLORS = {
  light: { page: "#F5F7FA", bar: "#F5F7FA" },
  dark: { page: "#0E1117", bar: "#0E1117" },
} as const;

/** Anything unknown or missing is "light": dark only appears when the person picks it. */
export function parseWamTheme(value: string | null | undefined): WamTheme {
  return (WAM_THEMES as readonly string[]).includes(value ?? "") ? value as WamTheme : "light";
}

/** The look a choice resolves to, given whether the device itself is dark. */
export function resolveWamTheme(theme: WamTheme, deviceDark: boolean): "light" | "dark" {
  return theme === "system" ? (deviceDark ? "dark" : "light") : theme;
}

/** The document.cookie string that stores a choice for a year, for WAM's pages only. */
export function wamThemeCookie(theme: WamTheme, secure: boolean): string {
  return `${WAM_THEME_COOKIE}=${theme}; Path=${PRA_WAM_PATH}; Max-Age=${ONE_YEAR}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

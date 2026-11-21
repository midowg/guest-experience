/*
 * WG People's look on this device (21 Nov 2026, the owner's ask): light by default, dark only when
 * the person picks it in Profil → Tampilan. Not the phone's own setting. Kept in a cookie so the
 * server draws the right one at once (no flash). Pure, so it is shared by the server and the app.
 */
export const THEMES = ["terang", "gelap"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "wg_tema";
export const themeLabels: Record<Theme, string> = { terang: "Terang", gelap: "Gelap" };
/** The page colour behind the app, for the phone's status bar and the edges. */
export const themeColors: Record<Theme, string> = { terang: "#F3F6FA", gelap: "#0B1220" };
export const asTheme = (value: string | null | undefined): Theme => (value === "gelap" ? "gelap" : "terang");

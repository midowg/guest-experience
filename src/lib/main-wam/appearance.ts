import { PRA_WAM_PATH } from "@/lib/routes";

/*
 * The person's choice of look for Main WAM, in Saya → Pengaturan → Tampilan: Terang, Gelap or Sistem
 * (follow the phone). Kept per device in a first-party cookie (not in the database), so the server
 * draws the right mode from the first byte and nothing flashes. Its own cookie, apart from Pra WAM's
 * `wam_theme` (that one starts at dark, this one at Sistem).
 */

export const MAIN_WAM_MODE_COOKIE = "mw_mode";
export const MAIN_WAM_MODES = ["light", "dark", "system"] as const;
export type MainWamMode = (typeof MAIN_WAM_MODES)[number];
export const DEFAULT_MAIN_WAM_MODE: MainWamMode = "system";

export const mainWamModeLabels: Record<MainWamMode, string> = { light: "Terang", dark: "Gelap", system: "Sistem" };

/** Anything unknown or missing is "system". */
export function parseMainWamMode(value: string | null | undefined): MainWamMode {
  return (MAIN_WAM_MODES as readonly string[]).includes(value ?? "") ? value as MainWamMode : DEFAULT_MAIN_WAM_MODE;
}

const ONE_YEAR = 60 * 60 * 24 * 365;
/** The document.cookie string that keeps a choice for a year, for WAM's pages only. */
export function mainWamModeCookie(mode: MainWamMode, secure: boolean): string {
  return `${MAIN_WAM_MODE_COOKIE}=${mode}; Path=${PRA_WAM_PATH}; Max-Age=${ONE_YEAR}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

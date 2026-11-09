import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { DEFAULT_WAM_LOOK, parseWamLook, parseWamTheme, WAM_THEME_COOKIE, type WamLook, type WamTheme } from "@/lib/pra-wam/theme";
import { isSupabaseConfigured, ServiceError } from "../config";
import { databaseError } from "../http";
import { createPrivilegedClient } from "../supabase/admin";

/** The mode the person picked (dark when nothing is picked yet). */
export async function readWamTheme(): Promise<WamTheme> {
  return parseWamTheme((await cookies()).get(WAM_THEME_COOKIE)?.value);
}

/*
 * The app's theme (migration 202611090001): pw_app_settings.theme, set by an admin. Before the
 * migration, or when the database cannot be read, everyone sees the default theme: the look never
 * stops a page from opening.
 */
export const THEME_MIGRATION = "202611090001_pra_wam_app_theme.sql";
const missing = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /pw_app_settings|theme/.test(error.message ?? "");

export type WamLookState = { look: WamLook; migrated: boolean; updatedAt: string | null };

async function readLookState(): Promise<WamLookState> {
  if (!isSupabaseConfigured()) return { look: DEFAULT_WAM_LOOK, migrated: false, updatedAt: null };
  const { data, error } = await createPrivilegedClient().from("pw_app_settings").select("theme,updated_at").eq("id", true).maybeSingle();
  if (error) {
    if (missing(error)) return { look: DEFAULT_WAM_LOOK, migrated: false, updatedAt: null };
    databaseError(error);
  }
  return { look: parseWamLook(data?.theme), migrated: true, updatedAt: data?.updated_at ?? null };
}

/** Admin WAM → Tema aplikasi: the theme in use and whether it can be changed yet. */
export const wamLookState = cache(readLookState);

/** The theme every WAM page paints with; read once per request, the default on any failure. */
export const readWamLook = cache(async (): Promise<WamLook> => {
  try { return (await readLookState()).look; } catch { return DEFAULT_WAM_LOOK; }
});

/** Any admin: the theme for everyone. */
export async function setWamLook(look: WamLook): Promise<WamLookState> {
  const { error } = await createPrivilegedClient().from("pw_app_settings")
    .upsert({ id: true, theme: look, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) {
    if (missing(error)) throw new ServiceError(503, `Tema aplikasi menunggu migrasi ${THEME_MIGRATION}.`);
    databaseError(error);
  }
  return readLookState();
}

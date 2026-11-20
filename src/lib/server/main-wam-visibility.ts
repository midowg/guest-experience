import "server-only";
import { cache } from "react";
import { HIDDEN_MAIN_WAM, MAIN_WAM_VISIBILITY_MIGRATION, visibilityFromRow, type MainWamVisibility } from "@/lib/main-wam-visibility";
import { ServiceError } from "./config";
import { databaseError } from "./http";
import { createPrivilegedClient } from "./supabase/admin";

/*
 * Whether Main WAM shows in Journey (src/lib/main-wam-visibility.ts): read once per request, never throws
 * (before the migration, without a database, on any error: hidden). Only the super admin switches it
 * (the API checks requireSuperAdmin); the row keeps when and by whom, and the server log says so too.
 */

const notMigrated = (error: { code?: string; message?: string }) =>
  ["42P01", "PGRST205", "42703", "PGRST204"].includes(error.code ?? "") || /main_wam_shown/.test(error.message ?? "");

async function readVisibility(): Promise<MainWamVisibility> {
  try {
    const { data, error } = await createPrivilegedClient().from("admin_settings").select("main_wam_shown,main_wam_shown_at,main_wam_shown_by").maybeSingle();
    if (error) return { ...HIDDEN_MAIN_WAM, migrated: !notMigrated(error) };
    return visibilityFromRow(data as Parameters<typeof visibilityFromRow>[0]);
  } catch {
    return HIDDEN_MAIN_WAM;
  }
}

/** Is Main WAM shown in Journey? (Hidden until the super admin shows it.) */
export const getMainWamVisibility = cache(readVisibility);
export const mainWamHidden = async (): Promise<boolean> => !(await getMainWamVisibility()).shown;

/** Super admin: show or hide Main WAM. Throws 503 before the migration. */
export async function setMainWamShown(shown: boolean, by: string): Promise<MainWamVisibility> {
  const at = new Date().toISOString();
  const { data, error } = await createPrivilegedClient().from("admin_settings")
    .update({ main_wam_shown: shown, main_wam_shown_at: at, main_wam_shown_by: by.slice(0, 150), updated_at: at })
    .eq("id", true).select("main_wam_shown,main_wam_shown_at,main_wam_shown_by").maybeSingle();
  if (error) {
    if (notMigrated(error)) throw new ServiceError(503, `Pengaturan ini menunggu migrasi ${MAIN_WAM_VISIBILITY_MIGRATION}.`);
    databaseError(error);
  }
  if (!data) throw new ServiceError(503, "Pengaturan admin belum ada. Jalankan migrasi pengaturan admin terlebih dahulu.");
  console.info(`admin_settings: Main WAM ${shown ? "ditampilkan" : "disembunyikan"} oleh ${by.slice(0, 150)} pada ${at}`);
  return visibilityFromRow(data as Parameters<typeof visibilityFromRow>[0]);
}

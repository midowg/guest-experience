import "server-only";
import { adminModules, isAdminModule, type AdminModule } from "@/lib/admin-modules";
import type { AdminRole } from "@/lib/admin-token";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";

const notMigrated = (error: { code?: string; message?: string }) =>
  error.code === "42P01" || error.code === "PGRST205" || /admin_settings/.test(error.message ?? "");

/** Modules the super admin switched off. Before 202610200006 nothing is switched off. */
export async function getDisabledModules(): Promise<{ modules: AdminModule[]; migrated: boolean }> {
  const { data, error } = await createPrivilegedClient().from("admin_settings").select("disabled_modules").maybeSingle();
  if (error) { if (notMigrated(error)) return { modules: [], migrated: false }; databaseError(error); }
  return { modules: ((data?.disabled_modules as string[] | undefined) ?? []).filter(isAdminModule), migrated: true };
}

/** What the signed-in role may not use: nothing for the super admin. */
export async function disabledModulesFor(role: AdminRole): Promise<AdminModule[]> {
  return role === "super" ? [] : (await getDisabledModules()).modules;
}

export async function setDisabledModules(modules: AdminModule[]): Promise<AdminModule[]> {
  const ordered = adminModules.map(module => module.key).filter(key => modules.includes(key));
  const { data, error } = await createPrivilegedClient().from("admin_settings").update({ disabled_modules: ordered, updated_at: new Date().toISOString() }).eq("id", true).select("disabled_modules").maybeSingle();
  if (error) {
    if (notMigrated(error)) throw new ServiceError(503, "Pengaturan modul menunggu migrasi 202610200006_admin_modules.sql.");
    databaseError(error);
  }
  return ((data?.disabled_modules as string[] | undefined) ?? []).filter(isAdminModule);
}

export function moduleNames(keys: AdminModule[]): string {
  return keys.map(key => adminModules.find(module => module.key === key)!.label).join(", ");
}

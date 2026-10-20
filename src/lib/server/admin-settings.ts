import "server-only";
import { adminModules, isAdminModule, type AdminModule } from "@/lib/admin-modules";
import type { AdminRole } from "@/lib/admin-token";
import { defaultTemplates, templateKeys, type TemplateKey } from "@/lib/event-templates";
import { createPrivilegedClient } from "./supabase/admin";
import { databaseError } from "./http";
import { ServiceError } from "./config";

const notMigrated = (error: { code?: string; message?: string }) =>
  error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || error.code === "PGRST204" || /admin_settings|enabled_templates/.test(error.message ?? "");
const isTemplate = (value: string): value is TemplateKey => (templateKeys as readonly string[]).includes(value);

/** Modules the super admin switched off. Before 202610200006 nothing is switched off. */
export async function getDisabledModules(): Promise<{ modules: AdminModule[]; migrated: boolean }> {
  const { data, error } = await createPrivilegedClient().from("admin_settings").select("disabled_modules").maybeSingle();
  if (error) { if (notMigrated(error)) return { modules: [], migrated: false }; databaseError(error); }
  return { modules: ((data?.disabled_modules as string[] | undefined) ?? []).filter(isAdminModule), migrated: true };
}

/** Templates offered in "Buat acara". Before 202610200007 the two client-hosting templates. */
export async function getEnabledTemplates(): Promise<{ templates: TemplateKey[]; migrated: boolean }> {
  const { data, error } = await createPrivilegedClient().from("admin_settings").select("enabled_templates").maybeSingle();
  if (error) { if (notMigrated(error)) return { templates: [...defaultTemplates], migrated: false }; databaseError(error); }
  return { templates: ((data?.enabled_templates as string[] | undefined) ?? [...defaultTemplates]).filter(isTemplate), migrated: true };
}

/** What the signed-in role may not use: nothing for the super admin. */
export async function disabledModulesFor(role: AdminRole): Promise<AdminModule[]> {
  return role === "super" ? [] : (await getDisabledModules()).modules;
}
/** Templates the signed-in role may start from: all of them for the super admin. */
export async function templatesFor(role: AdminRole): Promise<TemplateKey[]> {
  return role === "super" ? [...templateKeys] : (await getEnabledTemplates()).templates;
}

async function updateSettings(patch: Record<string, unknown>, column: string, migration: string) {
  const { data, error } = await createPrivilegedClient().from("admin_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", true).select(column).maybeSingle();
  if (error) {
    if (notMigrated(error)) throw new ServiceError(503, `Pengaturan ini menunggu migrasi ${migration}.`);
    databaseError(error);
  }
  return ((data as Record<string, unknown> | null)?.[column] as string[] | undefined) ?? [];
}

export async function setDisabledModules(modules: AdminModule[]): Promise<AdminModule[]> {
  const ordered = adminModules.map(module => module.key).filter(key => modules.includes(key));
  return (await updateSettings({ disabled_modules: ordered }, "disabled_modules", "202610200006_admin_modules.sql")).filter(isAdminModule);
}

export async function setEnabledTemplates(templates: TemplateKey[]): Promise<TemplateKey[]> {
  const ordered = templateKeys.filter(key => templates.includes(key));
  return (await updateSettings({ enabled_templates: ordered }, "enabled_templates", "202610200007_admin_templates.sql")).filter(isTemplate);
}

export function moduleNames(keys: AdminModule[]): string {
  return keys.map(key => adminModules.find(module => module.key === key)!.label).join(", ");
}

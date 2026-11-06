import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { PageHeader } from "@/components/console";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { ModuleSettings } from "@/components/admin/super/ModuleSettings";
import { getDisabledModules } from "@/lib/server/admin-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modul admin · Super admin" };

/** Super admin: which modules may be used when making or changing an event. */
export default async function SuperModulesPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const modules = await getDisabledModules();
  return <SuperAdminFrame current="modul">
    <PageHeader title="Modul admin" subtitle="Modul yang boleh dipakai saat membuat atau mengubah acara." />
    <ModuleSettings initialDisabled={modules.modules} migrated={modules.migrated} />
  </SuperAdminFrame>;
}

import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { PageHeader } from "@/components/console";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { TemplateSettings } from "@/components/admin/super/TemplateSettings";
import { getEnabledTemplates } from "@/lib/server/admin-settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Templat · Super admin" };

/** Super admin: which templates a regular admin can pick. */
export default async function SuperTemplatesPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const templates = await getEnabledTemplates();
  return <SuperAdminFrame current="templat">
    <PageHeader title="Templat" subtitle="Templat yang bisa dipilih admin biasa saat membuat acara." />
    <TemplateSettings initialEnabled={templates.templates} migrated={templates.migrated} />
  </SuperAdminFrame>;
}

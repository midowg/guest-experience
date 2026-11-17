import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { Notice } from "@/components/ui";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { mainWamModuleTabs } from "@/components/admin/wam/main-wam/tabs";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Silent Meeting · Main WAM · Admin WAM" };

/**
 * Admin WAM → Main WAM → Silent Meeting. PLACEHOLDER (fondasi): owner agen D, docs/main-wam/KONTRAK.md §6.
 * Pertanyaan Silent Meeting per sesi, topik, dan tutup otomatis.
 */
export default async function SilentMeetingAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="mw-silent">
    <PageHeader crumbs={wamCrumbs("mw-silent")} title="Main WAM · Silent Meeting" subtitle="Pertanyaan Silent Meeting per sesi, topik, dan tutup otomatis." />
    <PageTabs tabs={mainWamModuleTabs} current="silent-meeting" label="Modul acara" />
    <Notice tone="info">Halaman ini sedang dibangun.</Notice>
  </WamAdminFrame>;
}

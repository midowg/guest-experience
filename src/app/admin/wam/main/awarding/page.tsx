import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { Notice } from "@/components/ui";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { mainWamModuleTabs } from "@/components/admin/wam/main-wam/tabs";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Awarding · Main WAM · Admin WAM" };

/**
 * Admin WAM → Main WAM → Awarding. PLACEHOLDER (fondasi): owner agen D, docs/main-wam/KONTRAK.md §6.
 * Kategori Awarding (cara, jendela voting, waktu diumumkan, sesi), nominasi, dan terbit.
 */
export default async function AwardingAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="mw-modul">
    <PageHeader crumbs={wamCrumbs("mw-modul")} title="Main WAM · Awarding" subtitle="Kategori Awarding (cara, jendela voting, waktu diumumkan, sesi), nominasi, dan terbit." />
    <PageTabs tabs={mainWamModuleTabs} current="awarding" label="Modul acara" />
    <Notice tone="info">Halaman ini sedang dibangun.</Notice>
  </WamAdminFrame>;
}

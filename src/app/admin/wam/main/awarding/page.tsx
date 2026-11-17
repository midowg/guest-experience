import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { AwardsAdmin } from "@/components/admin/wam/main-wam/modul/AwardsAdmin";
import { mainWamModuleTabs } from "@/components/admin/wam/main-wam/tabs";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminAwards } from "@/lib/server/main-wam/modul/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Awarding · Main WAM · Admin WAM" };

/** Admin WAM → Main WAM → Awarding (agen D): categories, window, nominees, counts and the BOD's approval. */
export default async function AwardingAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const data = await adminAwards();
  return <WamAdminFrame current="mw-modul">
    <PageHeader crumbs={wamCrumbs("mw-modul")} title="Main WAM · Awarding" subtitle="Kategori, jendela voting, nominasi, dan perolehan suara untuk persetujuan BOD." />
    <PageTabs tabs={mainWamModuleTabs} current="awarding" label="Modul acara" />
    <AwardsAdmin initial={data} />
  </WamAdminFrame>;
}

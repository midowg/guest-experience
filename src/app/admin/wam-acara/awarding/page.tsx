import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { AwardsAdmin } from "@/components/admin/wam-acara/modul/AwardsAdmin";
import { mainWamModuleTabs } from "@/components/admin/wam-acara/tabs";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminAwards } from "@/lib/server/main-wam/modul/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: `Awarding · ${WAM_EVENT_ADMIN_LABEL}` };

/** Admin WAM 2027 → Awarding (agen D): categories, window, nominees, counts and the BOD's approval. */
export default async function AwardingAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const data = await adminAwards();
  return <WamAcaraFrame current="modul">
    <PageHeader crumbs={wamAcaraCrumbs("modul")} title="Awarding" subtitle="Kategori, jendela voting, nominasi, dan perolehan suara untuk persetujuan BOD." />
    <PageTabs tabs={mainWamModuleTabs} current="awarding" label="Modul acara" />
    <AwardsAdmin initial={data} />
  </WamAcaraFrame>;
}

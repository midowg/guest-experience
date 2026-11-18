import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { SilentAdmin } from "@/components/admin/wam/main-wam/modul/SilentAdmin";
import { mainWamModuleTabs } from "@/components/admin/wam/main-wam/tabs";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminSilent } from "@/lib/server/main-wam/modul/admin";
import { readMainWamSettings } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Silent Meeting · Main WAM · Admin WAM" };

/** Admin WAM → Main WAM → Silent Meeting (agen D): one question per session and its topics. */
export default async function SilentMeetingAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [data, settings] = await Promise.all([adminSilent(), readMainWamSettings()]);
  return <WamAdminFrame current="mw-silent">
    <PageHeader crumbs={wamCrumbs("mw-silent")} title="Main WAM · Silent Meeting" subtitle="Pertanyaan per sesi dan topiknya. Masukan tidak pernah tampil di sini." />
    <PageTabs tabs={mainWamModuleTabs} current="silent-meeting" label="Modul acara" />
    <SilentAdmin initial={data} moduleOn={settings.modules.silent} />
  </WamAdminFrame>;
}

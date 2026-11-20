import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PageHeader, PageTabs } from "@/components/console";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { SilentAdmin } from "@/components/admin/wam-acara/modul/SilentAdmin";
import { mainWamModuleTabs } from "@/components/admin/wam-acara/tabs";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminSilent } from "@/lib/server/main-wam/modul/admin";
import { readMainWamSettings } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: `Silent Meeting · ${WAM_EVENT_ADMIN_LABEL}` };

/** Admin WAM 2026 → Silent Meeting (agen D): one question per session and its topics. */
export default async function SilentMeetingAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [data, settings] = await Promise.all([adminSilent(), readMainWamSettings()]);
  return <WamAcaraFrame current="silent">
    <PageHeader crumbs={wamAcaraCrumbs("silent")} title="Silent Meeting" subtitle="Pertanyaan per sesi dan topiknya. Masukan tidak pernah tampil di sini." />
    <PageTabs tabs={mainWamModuleTabs} current="silent-meeting" label="Modul acara" />
    <SilentAdmin initial={data} moduleOn={settings.modules.silent} />
  </WamAcaraFrame>;
}

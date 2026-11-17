import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { EventInfoEditor } from "@/components/admin/wam/main-wam/isi/EventInfoEditor";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs } from "@/components/admin/wam/sections";
import { defaultSettings } from "@/lib/main-wam/settings";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminPeople } from "@/lib/server/main-wam/admin/common";
import { mainWamSettingsState } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Info acara · Main WAM · Admin WAM" };

/**
 * Admin WAM → Main WAM → Info acara (agen E, docs/main-wam/KONTRAK.md §6): hotel, address,
 * check-in/out, contacts, and the hotel's bills for Jejak karbon. Any Admin WAM admin.
 */
export default async function InfoAcaraAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [settings, people] = await Promise.all([mainWamSettingsState().catch(() => defaultSettings()), adminPeople()]);
  return <WamAdminFrame current="mw-info">
    <EventInfoEditor initial={settings} people={people} crumbs={wamCrumbs("mw-info")} title="Main WAM · Info acara" />
  </WamAdminFrame>;
}

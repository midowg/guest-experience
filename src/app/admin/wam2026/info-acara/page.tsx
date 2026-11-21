import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { EventInfoEditor } from "@/components/admin/wam-acara/isi/EventInfoEditor";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { wamAcaraCrumbs } from "@/components/admin/wam-acara/sections";
import { defaultSettings } from "@/lib/main-wam/settings";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminPeople } from "@/lib/server/main-wam/admin/common";
import { mainWamSettingsState } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: `Info acara · ${WAM_EVENT_ADMIN_LABEL}` };

/**
 * Admin WAM 2026 → Info acara (agen E, docs/main-wam/KONTRAK.md §6): hotel, address,
 * check-in/out, contacts, and the hotel's bills for Jejak karbon. any Admin WAM 2026 admin.
 */
export default async function InfoAcaraAdminPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [settings, people] = await Promise.all([mainWamSettingsState().catch(() => defaultSettings()), adminPeople()]);
  return <WamAcaraFrame current="info">
    <EventInfoEditor initial={settings} people={people} crumbs={wamAcaraCrumbs("info")} title="Info acara" />
  </WamAcaraFrame>;
}

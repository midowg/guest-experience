import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { WamAcaraHome } from "@/components/admin/wam-acara/WamAcaraHome";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { defaultSettings } from "@/lib/main-wam/settings";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { getMainWamVisibility } from "@/lib/server/main-wam-visibility";
import { listTesters, mainWamSettingsState } from "@/lib/server/main-wam/settings";
import { listWamStaff } from "@/lib/server/main-wam/staff";

export const dynamic = "force-dynamic";
export const metadata = { title: WAM_EVENT_ADMIN_LABEL };

/** Admin WAM 2027 → Ringkasan (KONTRAK §15): each part that cannot be read yet (a migration) says so. */
export default async function WamAcaraHomePage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [settings, testers, staff, visibility] = await Promise.all([
    mainWamSettingsState().catch(() => defaultSettings()),
    listTesters().catch(() => ({ testers: [], migrated: false })),
    listWamStaff().catch(() => ({ staff: [], migrated: false, event: null })),
    getMainWamVisibility(),
  ]);
  return <WamAcaraFrame current="ringkasan">
    <WamAcaraHome settings={settings} testers={testers.testers.length} staff={{ count: staff.staff.length, migrated: staff.migrated }} shown={visibility.shown} />
  </WamAcaraFrame>;
}

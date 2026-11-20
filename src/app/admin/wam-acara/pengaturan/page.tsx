import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { MainWamSettings } from "@/components/admin/wam-acara/MainWamSettings";
import { WamAcaraFrame } from "@/components/admin/wam-acara/WamAcaraFrame";
import { WAM_EVENT_ADMIN_LABEL } from "@/lib/admin-access";
import { wamAcaraCrumbs, wamAcaraSection } from "@/components/admin/wam-acara/sections";
import { defaultSettings } from "@/lib/main-wam/settings";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { isR2Configured } from "@/lib/server/r2";
import { listTesters, mainWamSettingsState, settingsPageOptions } from "@/lib/server/main-wam/settings";
import { mainWamHidden } from "@/lib/server/main-wam-visibility";

export const dynamic = "force-dynamic";
export const metadata = { title: `Pengaturan · ${WAM_EVENT_ADMIN_LABEL}` };

/** any Admin WAM 2027 admin: Main WAM's mode, penguji, modules and theme (docs/main-wam/KONTRAK.md §3). */
export default async function MainWamSettingsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [settings, testers, options, hidden] = await Promise.all([
    mainWamSettingsState().catch(() => defaultSettings()), listTesters().catch(() => ({ testers: [], migrated: false })), settingsPageOptions(), mainWamHidden(),
  ]);
  return <WamAcaraFrame current="pengaturan">
    <MainWamSettings initial={settings} testers={testers.testers} testersMigrated={testers.migrated} people={options.people} forms={options.forms}
      storage={isR2Configured()} crumbs={wamAcaraCrumbs("pengaturan")} title={wamAcaraSection("pengaturan").label} hidden={hidden} />
  </WamAcaraFrame>;
}

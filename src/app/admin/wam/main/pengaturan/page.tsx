import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { MainWamSettings } from "@/components/admin/wam/main-wam/MainWamSettings";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs, wamSection } from "@/components/admin/wam/sections";
import { defaultSettings } from "@/lib/main-wam/settings";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { isR2Configured } from "@/lib/server/r2";
import { listTesters, mainWamSettingsState, settingsPageOptions } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengaturan Main WAM · Admin WAM" };

/** Any Admin WAM admin: Main WAM's mode, penguji, modules and theme (docs/main-wam/KONTRAK.md §3). */
export default async function MainWamSettingsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [settings, testers, options] = await Promise.all([
    mainWamSettingsState().catch(() => defaultSettings()), listTesters().catch(() => ({ testers: [], migrated: false })), settingsPageOptions(),
  ]);
  return <WamAdminFrame current="mw-pengaturan">
    <MainWamSettings initial={settings} testers={testers.testers} testersMigrated={testers.migrated} people={options.people} forms={options.forms}
      storage={isR2Configured()} crumbs={wamCrumbs("mw-pengaturan")} title={`Main WAM · ${wamSection("mw-pengaturan").label}`} />
  </WamAdminFrame>;
}

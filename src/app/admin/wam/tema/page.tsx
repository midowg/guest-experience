import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamTheme } from "@/components/admin/wam/PraWamTheme";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamCrumbs, wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { THEME_MIGRATION, wamLookState } from "@/lib/server/pra-wam/theme";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("tema").label} · Admin WAM` };

/** Any admin: the theme everyone sees in the WAM app, each shown in light and dark. */
export default async function WamThemePage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="tema">
    <PraWamTheme initial={await wamLookState()} migration={THEME_MIGRATION} crumbs={wamCrumbs("tema")} title={wamSection("tema").label} />
  </WamAdminFrame>;
}

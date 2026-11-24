import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamTestAccounts } from "@/components/admin/wam/PraWamTestAccounts";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { WAM_ADMIN_LABEL, wamCrumbs, wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { testAccountsState } from "@/lib/server/pra-wam/test-accounts";
import { missionSessionIds } from "@/lib/server/pra-wam/mission-sessions";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("uji").label} · ${WAM_ADMIN_LABEL}` };

/** Any admin: Akun uji (24 Nov 2026), accounts that try Misi Perjalanan and Jejak karbon before the event. */
export default async function WamTestAccountsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="uji">
    <PraWamTestAccounts initial={await testAccountsState()} missionSessionId={(await missionSessionIds())[0] ?? null} crumbs={wamCrumbs("uji")} title={wamSection("uji").label} />
  </WamAdminFrame>;
}

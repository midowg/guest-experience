import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamResetRequests } from "@/components/admin/wam/PraWamResetRequests";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { accountSummary, summaryLine } from "@/components/admin/wam/akun/account-view";
import { wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { defaultPasswordReady, listAccounts } from "@/lib/server/pra-wam/accounts";
import { accountExtras, RESET_HISTORY_DAYS, resetHistory } from "@/lib/server/pra-wam/admin-overview";
import { listResetRequests } from "@/lib/server/pra-wam/reset-requests";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("reset").label} · Admin WAM` };

/**
 * Any admin, tab Permintaan reset of Akun dan peran: the "Lupa password" requests, answered with a
 * reset to the first password or declined, and what was handled in the last 30 days.
 */
export default async function WamResetRequestsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [list, recent, accounts, extras] = await Promise.all([listResetRequests(), resetHistory(), listAccounts().catch(() => null), accountExtras()]);
  return <WamAdminFrame current="reset">
    <PraWamResetRequests initial={list} passwordReady={defaultPasswordReady()} recent={recent} days={RESET_HISTORY_DAYS} photos={extras.photos}
      subtitle={accounts?.migrated ? summaryLine(accountSummary(accounts.rows)) : undefined} />
  </WamAdminFrame>;
}

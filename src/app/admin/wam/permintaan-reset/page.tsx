import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamResetRequests } from "@/components/admin/wam/PraWamResetRequests";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { defaultPasswordReady } from "@/lib/server/pra-wam/accounts";
import { listResetRequests } from "@/lib/server/pra-wam/reset-requests";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("reset").label} · Admin WAM` };

/** Any admin: the "Lupa password" requests, answered with a reset to the first password or declined. */
export default async function WamResetRequestsPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  return <WamAdminFrame current="reset">
    <PraWamResetRequests initial={await listResetRequests()} passwordReady={defaultPasswordReady()} />
  </WamAdminFrame>;
}

import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamAccounts } from "@/components/admin/wam/PraWamAccounts";
import { WamAdminFrame, waitingResetRequests } from "@/components/admin/wam/WamAdminFrame";
import { wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { defaultPasswordReady, listAccounts } from "@/lib/server/pra-wam/accounts";
import { accountExtras, openResetEmployeeIds } from "@/lib/server/pra-wam/admin-overview";
import { leadOptions } from "@/lib/server/pra-wam/leads";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("akun").label} · Admin WAM` };

/** Any admin, tab Akun: WAM accounts as cards or a table, roles, the sign-in email and password resets. */
export default async function WamAccountsPage() {
  const role = await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [{ rows, migrated }, extras, requested, waiting, options] = await Promise.all([listAccounts(), accountExtras(), openResetEmployeeIds(), waitingResetRequests(), leadOptions().catch(() => undefined)]);
  return <WamAdminFrame current="akun">
    <PraWamAccounts initial={rows} migrated={migrated} passwordReady={defaultPasswordReady()} superAdmin={role === "super"}
      photos={extras.photos} jobs={extras.jobs} resetRequested={requested} waiting={waiting} leadOptions={options} />
  </WamAdminFrame>;
}

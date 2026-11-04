import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamAccounts } from "@/components/admin/wam/PraWamAccounts";
import { WamAdminFrame } from "@/components/admin/wam/WamAdminFrame";
import { wamSection } from "@/components/admin/wam/sections";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { defaultPasswordReady, listAccounts } from "@/lib/server/pra-wam/accounts";

export const dynamic = "force-dynamic";
export const metadata = { title: `${wamSection("akun").label} · Admin WAM` };

/** Any admin: WAM accounts, roles, the sign-in email and password resets. */
export default async function WamAccountsPage() {
  const role = await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { rows, migrated } = await listAccounts();
  return <WamAdminFrame current="akun">
    <PraWamAccounts initial={rows} migrated={migrated} passwordReady={defaultPasswordReady()} superAdmin={role === "super"} />
  </WamAdminFrame>;
}

import { Notice } from "@/components/ui";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { WamAdminFrame, waitingResetRequests } from "@/components/admin/wam/WamAdminFrame";
import { AccountsHeader } from "@/components/admin/wam/akun/AccountsHeader";
import { RoleGuide } from "@/components/admin/wam/akun/RoleGuide";
import { accountSummary, roleCounts, summaryLine } from "@/components/admin/wam/akun/account-view";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listAccounts } from "@/lib/server/pra-wam/accounts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Peran · Akun dan peran · Admin WAM" };

/** Any admin, tab Peran: what each role does, how many hold it, and which roles go together. */
export default async function WamRolesPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [{ rows, migrated }, waiting] = await Promise.all([listAccounts(), waitingResetRequests()]);
  return <WamAdminFrame current="akun">
    <AccountsHeader tab="peran" waiting={waiting} subtitle={migrated ? summaryLine(accountSummary(rows)) : undefined} />
    {!migrated && <Notice tone="warning">Akun Pra WAM menunggu migrasi 202611040001_pra_wam_appraisal.sql. Jumlah orang per peran tampil setelah itu.</Notice>}
    <RoleGuide counts={migrated ? roleCounts(rows) : null} />
  </WamAdminFrame>;
}

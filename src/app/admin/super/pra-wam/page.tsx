import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamAccounts } from "@/components/admin/super/PraWamAccounts";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listAccounts } from "@/lib/server/pra-wam/accounts";
import styles from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Akun Pra WAM" };

/** Super admin only: sign-ins for Pra WAM, one per person in Data karyawan. */
export default async function PraWamAccountsPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { rows, migrated } = await listAccounts();
  return <AdminShell>
    <p className="eyebrow"><Link href="/admin/super">Super admin</Link></p>
    <h1 className={styles.title}>Akun Pra WAM</h1>
    <PraWamAccounts initial={rows} migrated={migrated} passwordReady={(process.env.PRA_WAM_DEFAULT_PASSWORD ?? "").length >= 8} />
  </AdminShell>;
}

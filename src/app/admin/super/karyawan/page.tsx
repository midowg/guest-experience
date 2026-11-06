import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { EmployeeDirectory, type WamAccounts } from "@/components/admin/super/EmployeeDirectory";
import { UnitImport } from "@/components/admin/super/UnitImport";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listEmployees } from "@/lib/server/employees";
import { defaultPasswordReady, listAccounts } from "@/lib/server/pra-wam/accounts";
import { listUnits } from "@/lib/server/pra-wam/units";
import { leadOptions, listLeads } from "@/lib/server/pra-wam/leads";
import type { Leads } from "@/lib/pra-wam/leads";
import styles from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data karyawan" };

/** Who has a WAM sign-in. A failure here leaves the rest of Data karyawan working (null). */
async function wamAccounts(): Promise<WamAccounts | null> {
  try {
    const { rows, migrated } = await listAccounts();
    return { migrated, passwordReady: defaultPasswordReady(), withAccount: rows.filter(row => row.hasAccount).map(row => row.employeeId),
      roles: Object.fromEntries(rows.filter(row => row.roles.length).map(row => [row.employeeId, row.roles])) };
  } catch { return null; }
}

/** Who heads which departments and BUs, and the names to pick from; null before migration 202611060002. */
async function leadData(): Promise<{ byPerson: Record<string, Leads>; options: Leads } | null> {
  try {
    const [{ byPerson, migrated }, options] = await Promise.all([listLeads(), leadOptions()]);
    return migrated ? { byPerson: Object.fromEntries(byPerson), options } : null;
  } catch { return null; }
}

/**
 * Super admin only: the shared list of Werkudara's people, their app accounts, and the units from
 * the same workbook. For anyone else the page does not exist.
 */
export default async function EmployeesPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [{ employees, migrated }, accounts, units, leads] = await Promise.all([listEmployees(), wamAccounts(), listUnits(), leadData()]);
  return <AdminShell>
    <p className="eyebrow"><Link href="/admin/super">Super admin</Link></p>
    <h1 className={styles.title}>Data karyawan</h1>
    <EmployeeDirectory initial={employees} migrated={migrated} wamAccounts={accounts} leads={leads?.byPerson} leadOptions={leads?.options} />
    <UnitImport initialUnits={units.units} initialMemberships={units.memberships} migrated={units.migrated} people={employees.map(person => ({ id: person.id, name: person.full_name }))} />
  </AdminShell>;
}

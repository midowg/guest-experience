import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { PraWamAccounts } from "@/components/admin/super/PraWamAccounts";
import { PraWamSetup } from "@/components/admin/super/PraWamSetup";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listAccounts } from "@/lib/server/pra-wam/accounts";
import { listRooms } from "@/lib/server/pra-wam/appraisal";
import { listEvents } from "@/lib/server/pra-wam/events";
import { listUnits } from "@/lib/server/pra-wam/units";
import styles from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Akun Pra WAM" };

/** Super admin only: Pra WAM's events and modules, units, accounts and roles, and rooms. */
export default async function PraWamAccountsPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { rows, migrated } = await listAccounts();
  const [rooms, events, units] = await Promise.all([migrated ? listRooms() : [], listEvents(), listUnits()]);
  return <AdminShell>
    <p className="eyebrow"><Link href="/admin/super">Super admin</Link></p>
    <h1 className={styles.title}>Akun Pra WAM</h1>
    <PraWamSetup initialEvents={events.events} eventsMigrated={events.migrated} initialUnits={units.units} initialMemberships={units.memberships} unitsMigrated={units.migrated}
      people={rows.map(row => ({ id: row.employeeId, name: row.name }))} />
    <PraWamAccounts initial={rows} initialRooms={rooms} migrated={migrated} passwordReady={(process.env.WAM_DEFAULT_PASSWORD ?? "").length >= 8} />
  </AdminShell>;
}

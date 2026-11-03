import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { EmployeeDirectory } from "@/components/admin/super/EmployeeDirectory";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listEmployees } from "@/lib/server/employees";
import styles from "@/components/admin/admin.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data karyawan" };

/** Super admin only: the shared list of Werkudara's people. For anyone else the page does not exist. */
export default async function EmployeesPage() {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const { employees, migrated } = await listEmployees();
  return <AdminShell>
    <p className="eyebrow"><Link href="/admin/super">Super admin</Link></p>
    <h1 className={styles.title}>Data karyawan</h1>
    <EmployeeDirectory initial={employees} migrated={migrated} />
  </AdminShell>;
}

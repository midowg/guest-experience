import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { KaryawanAdminFrame } from "@/components/admin/karyawan/KaryawanAdminFrame";
import { EmployeeDirectory } from "@/components/admin/super/EmployeeDirectory";
import { PageHeader } from "@/components/console";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listEmployees } from "@/lib/server/employees";
import { listJobs } from "@/lib/server/employee-jobs";
import { leadData, managesWam, wamAccounts } from "./data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Data karyawan" };

/** Data karyawan → Daftar karyawan: the list with Tambah, Ubah and Hapus, shared by every Journey app. */
export default async function EmployeesPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [{ employees, migrated }, accounts, leads, wam] = await Promise.all([listEmployees(), wamAccounts(), leadData(), managesWam()]);
  // Each person's jobs (9 Nov 2026); a failure leaves the list reading them from the person's columns.
  const jobs = await listJobs(employees).catch(() => null);
  const active = employees.filter(person => person.active).length;
  return <KaryawanAdminFrame current="daftar">
    <PageHeader title="Data karyawan" subtitle={`${active} karyawan aktif · dipakai bersama semua aplikasi Journey`} />
    <EmployeeDirectory initial={employees} migrated={migrated} wamAccounts={accounts} leads={leads?.byPerson} leadOptions={leads?.options}
      jobs={jobs?.byPerson} jobsMigrated={jobs?.migrated ?? true} gmMigrated={jobs?.gmReady ?? true} part="daftar" wamManage={wam} />
  </KaryawanAdminFrame>;
}

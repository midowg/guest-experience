import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { KaryawanAdminFrame } from "@/components/admin/karyawan/KaryawanAdminFrame";
import { EmployeeDirectory } from "@/components/admin/karyawan/EmployeeDirectory";
import { UnitImport } from "@/components/admin/karyawan/UnitImport";
import { PageHeader } from "@/components/console";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listEmployees } from "@/lib/server/employees";
import { listUnits } from "@/lib/server/pra-wam/units";
import { PRA_WAM_ADMIN_LABEL } from "@/lib/admin-access";
import { Notice } from "@/components/ui";
import { managesWam } from "@/components/admin/karyawan/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Impor Excel · Data karyawan" };

/** Data karyawan → Impor Excel: HR's workbook, and (with Admin Pra WAM) its units. */
export default async function ImportPage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [{ employees, migrated }, wam] = await Promise.all([listEmployees(), managesWam()]);
  const units = wam ? await listUnits() : null;
  return <KaryawanAdminFrame current="impor">
    <PageHeader title="Impor Excel" subtitle="Dari workbook HR: dicek dulu sebelum disimpan" />
    <EmployeeDirectory initial={employees} migrated={migrated} part="impor" wamManage={wam} />
    {units ? <UnitImport initialUnits={units.units} initialMemberships={units.memberships} migrated={units.migrated} people={employees.map(person => ({ id: person.id, name: person.full_name }))} />
      : <Notice>Impor unit (tim per departemen) dilakukan oleh super admin atau pemegang {PRA_WAM_ADMIN_LABEL}.</Notice>}
  </KaryawanAdminFrame>;
}

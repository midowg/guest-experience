import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { KaryawanAdminFrame } from "@/components/admin/karyawan/KaryawanAdminFrame";
import { OrgChart } from "@/components/admin/karyawan/OrgChart";
import { PageHeader } from "@/components/console";
import { buildOrg } from "@/lib/org";
import { BUSINESS_UNITS, buCode, leadDepartments } from "@/lib/pra-wam/leads";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listEmployees } from "@/lib/server/employees";
import { listJobs } from "@/lib/server/employee-jobs";
import { leadData, wamAccounts } from "@/components/admin/karyawan/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Struktur · Data karyawan" };

/** Data karyawan → Struktur: the organisation drawn from the list (BOD, Chief of Staff, departments, Atasan langsung). */
export default async function StructurePage() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const [{ employees }, accounts, leads] = await Promise.all([listEmployees(), wamAccounts(), leadData()]);
  const active = employees.filter(person => person.active);
  const jobs = await listJobs(employees).catch(() => null);
  return <KaryawanAdminFrame current="struktur" wide>
    <PageHeader title="Struktur" subtitle={`${active.length} karyawan aktif`} />
    <OrgChart org={buildOrg(
      active.map(person => ({ id: person.id, name: person.full_name, position: person.position, department: person.department, businessUnit: buCode(person.business_unit), reportsTo: person.reports_to ?? null,
        // The chart follows the Utama job: a Lead there, not a Lead job in another department.
        lead: leadDepartments(leads?.byPerson[person.id], person.department).includes(person.department.trim()),
        // GM or HOD and the team of the Utama job (10 Nov 2026), when the jobs are read.
        post: jobs?.byPerson[person.id]?.[0]?.post, unit: jobs?.byPerson[person.id]?.[0]?.unit })),
      new Set(Object.entries(accounts?.roles ?? {}).filter(([, roles]) => roles.includes("bod")).map(([id]) => id)),
      Object.entries(leads?.byPerson ?? {}).reduce<Record<string, string[]>>((all, [id, led]) => { for (const name of led.departments) all[name] = [...(all[name] ?? []), id]; return all; }, {}),
      BUSINESS_UNITS,
    )} />
  </KaryawanAdminFrame>;
}

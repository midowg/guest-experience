import { notFound } from "next/navigation";
import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { OrgChart } from "@/components/admin/super/OrgChart";
import { SuperAdminFrame } from "@/components/admin/super/SuperAdminFrame";
import { PageHeader, PageTabs } from "@/components/console";
import { buildOrg } from "@/lib/org";
import { BUSINESS_UNITS, buCode, leadDepartments } from "@/lib/pra-wam/leads";
import { listJobs } from "@/lib/server/employee-jobs";
import { EMPLOYEES_ADMIN } from "@/lib/routes";
import { EmployeeDirectory, type WamAccounts } from "@/components/admin/super/EmployeeDirectory";
import { UnitImport } from "@/components/admin/super/UnitImport";
import { isSupabaseConfigured } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { listEmployees } from "@/lib/server/employees";
import { defaultPasswordReady, listAccounts } from "@/lib/server/pra-wam/accounts";
import { listUnits } from "@/lib/server/pra-wam/units";
import { leadOptions, listLeads } from "@/lib/server/pra-wam/leads";
import type { LeadOptions, Leads } from "@/lib/pra-wam/leads";

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

/** Who heads which departments and who is a Lead, and the departments to pick from; null before migration 202611060002. */
async function leadData(): Promise<{ byPerson: Record<string, Leads>; options: LeadOptions } | null> {
  try {
    const [{ byPerson, migrated }, options] = await Promise.all([listLeads(), leadOptions()]);
    return migrated ? { byPerson: Object.fromEntries(byPerson), options } : null;
  } catch { return null; }
}

type Tab = "daftar" | "struktur" | "impor";
const tabs: { key: Tab; label: string }[] = [
  { key: "daftar", label: "Daftar karyawan" },
  { key: "struktur", label: "Struktur" },
  { key: "impor", label: "Impor Excel" },
];

/**
 * Super admin only (in the console frame, as Admin WAM): Werkudara's people in three tabs. Daftar
 * karyawan: the list with Tambah, Ubah and Hapus. Struktur: the organisation drawn from it (BOD,
 * Chief of Staff, departments, Atasan langsung). Impor Excel: HR's workbook and its units.
 */
export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if ((await requireAdminPage()) !== "super") notFound();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const asked = (await searchParams).tab;
  const tab: Tab = asked === "struktur" || asked === "impor" ? asked : "daftar";
  const [{ employees, migrated }, accounts, units, leads] = await Promise.all([listEmployees(), wamAccounts(), listUnits(), leadData()]);
  const active = employees.filter(person => person.active);
  // Each person's jobs (9 Nov 2026); a failure leaves the list reading them from the person's columns.
  const jobs = tab !== "impor" ? await listJobs(employees).catch(() => null) : null;
  return <SuperAdminFrame current="karyawan" wide={tab === "struktur"}>
    <PageHeader title="Data karyawan" subtitle={`${active.length} karyawan aktif · dipakai bersama semua aplikasi Journey`} />
    <PageTabs label="Bagian Data karyawan" current={tab} tabs={tabs.map(item => ({ key: item.key, label: item.label, href: item.key === "daftar" ? EMPLOYEES_ADMIN : `${EMPLOYEES_ADMIN}?tab=${item.key}` }))} />
    {tab === "struktur"
      ? <OrgChart org={buildOrg(
        active.map(person => ({ id: person.id, name: person.full_name, position: person.position, department: person.department, businessUnit: buCode(person.business_unit), reportsTo: person.reports_to ?? null,
          // The chart follows the Utama job: a Lead there, not a Lead job in another department.
          lead: leadDepartments(leads?.byPerson[person.id], person.department).includes(person.department.trim()),
          // GM or HOD and the team of the Utama job (10 Nov 2026), when the jobs are read.
          post: jobs?.byPerson[person.id]?.[0]?.post, unit: jobs?.byPerson[person.id]?.[0]?.unit })),
        new Set(Object.entries(accounts?.roles ?? {}).filter(([, roles]) => roles.includes("bod")).map(([id]) => id)),
        Object.entries(leads?.byPerson ?? {}).reduce<Record<string, string[]>>((all, [id, led]) => { for (const name of led.departments) all[name] = [...(all[name] ?? []), id]; return all; }, {}),
        BUSINESS_UNITS,
      )} />
      : <>
        <EmployeeDirectory initial={employees} migrated={migrated} wamAccounts={accounts} leads={leads?.byPerson} leadOptions={leads?.options}
          jobs={jobs?.byPerson} jobsMigrated={jobs?.migrated ?? true} gmMigrated={jobs?.gmReady ?? true} part={tab} />
        {tab === "impor" && <UnitImport initialUnits={units.units} initialMemberships={units.memberships} migrated={units.migrated} people={employees.map(person => ({ id: person.id, name: person.full_name }))} />}
      </>}
  </SuperAdminFrame>;
}

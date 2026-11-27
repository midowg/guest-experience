import { notFound } from "next/navigation";
import { KaryawanAdminFrame } from "@/components/admin/karyawan/KaryawanAdminFrame";
import { PageHeader } from "@/components/console";
import { EmployeeDirectory } from "@/components/admin/super/EmployeeDirectory";
import type { Employee } from "@/lib/employees";

export const dynamic = "force-dynamic";

/** Layout check for Data karyawan (its own admin app) with made-up people; ?wam=0 as an admin without Admin Pra WAM. Saving is refused without a session. */
export default async function DevEmployeesPage({ searchParams }: { searchParams: Promise<{ wam?: string }> }) {
  const wamManage = (await searchParams).wam !== "0";
  if (process.env.NODE_ENV === "production") notFound();
  const person = (n: number, full_name: string, department: string, position: string, patch: Partial<Employee> = {}): Employee => ({
    id: `6a000000-0000-4000-8000-00000000000${n}`, full_name, nickname: full_name.split(" ")[1] ?? "", department, position, office: "WNS", category: "karyawan", phone: "", email: "", active: true, nip: "", business_unit: "WNS", ...patch,
  });
  const people = [
    person(1, "Contoh Raka Pratama", "Sales & Marketing", "Business Solutions Manager", { phone: "0812 0000 0001", email: "raka@contoh.id" }),
    person(2, "Contoh Sari Dewi", "Human Resources & General Affair", "General Affair", { category: "dw" }),
    person(3, "Contoh Bima Putra", "Takshaka Event & Experience", "Experience & Service Innovation Lead", { office: "TEE" }),
    person(4, "Contoh Lala Ayu", "Accounting", "Tax Staff", { active: false }),
    person(5, "Contoh Yulia Mekar", "Business & Administrative Services", "Head of BAS", { business_unit: "MRP", phone: "0812 0000 0005", email: "yulia@contoh.id" }),
    person(6, "Contoh Dimas Magang", "Center of Excellence", "Design Intern", { category: "intern" }),
  ];
  const leads = { [people[4].id]: { departments: [], lead: true }, [people[0].id]: { departments: ["Sales & Marketing", "Corporate"], lead: false } };
  const options = { departments: [...new Set(people.map(item => item.department))].sort() };
  const accounts = { migrated: true, passwordReady: true, withAccount: [people[0].id, people[4].id], roles: { [people[4].id]: ["admin" as const] } };
  return <KaryawanAdminFrame current="daftar">
    <PageHeader title="Data karyawan" subtitle="5 karyawan aktif · dipakai bersama semua aplikasi Journey (contoh)" />
    <EmployeeDirectory initial={people} migrated leads={leads} leadOptions={options} wamAccounts={accounts} wamManage={wamManage} />
  </KaryawanAdminFrame>;
}

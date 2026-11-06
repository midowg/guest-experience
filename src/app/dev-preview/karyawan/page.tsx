import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { EmployeeDirectory } from "@/components/admin/super/EmployeeDirectory";
import type { Employee } from "@/lib/employees";

export const dynamic = "force-dynamic";

/** Layout check for Data karyawan with made-up people. Saving is refused without a session. */
export default function DevEmployeesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const person = (n: number, full_name: string, department: string, position: string, patch: Partial<Employee> = {}): Employee => ({
    id: `6a000000-0000-4000-8000-00000000000${n}`, full_name, nickname: full_name.split(" ")[1] ?? "", department, position, office: "WNS", category: "karyawan", phone: "", email: "", active: true, nip: "", business_unit: "WNS", ...patch,
  });
  const people = [
    person(1, "Contoh Raka Pratama", "Sales & Marketing", "Business Solutions Manager", { phone: "0812 0000 0001", email: "raka@contoh.id" }),
    person(2, "Contoh Sari Dewi", "Human Resources & General Affair", "General Affair", { category: "ga" }),
    person(3, "Contoh Bima Putra", "Takshaka Event & Experience", "Experience & Service Innovation Lead", { office: "TEE" }),
    person(4, "Contoh Lala Ayu", "Accounting", "Tax Staff", { active: false }),
    person(5, "Contoh Yulia Mekar", "Business & Administrative Services", "Head of BAS", { business_unit: "MRP", phone: "0812 0000 0005", email: "yulia@contoh.id" }),
    person(6, "Contoh Dimas Magang", "Center of Excellence", "Design Intern", { category: "intern" }),
  ];
  const leads = { [people[4].id]: { departments: ["Business & Administrative Services"], businessUnits: ["MRP"] }, [people[0].id]: { departments: ["Sales & Marketing", "Corporate"], businessUnits: [] } };
  const options = { departments: [...new Set(people.map(item => item.department))].sort(), businessUnits: ["MRP", "WNS", "TEE", "NMU", "WNN"] };
  return <AdminShell bare><h1>Data karyawan (contoh)</h1><EmployeeDirectory initial={people} migrated leads={leads} leadOptions={options} /></AdminShell>;
}

import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/shared/AdminShell";
import { ModuleSettings } from "@/components/admin/super/ModuleSettings";
import { StaffSettings } from "@/components/admin/super/StaffSettings";

export const dynamic = "force-dynamic";

/** Layout check for the super admin team and module settings. Changes are refused without a session. Templat & acara: /dev-preview/templat. */
export default function DevSuperPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const person = (n: number, name: string, role: string, photo = "", active = true) => ({ id: `5f000000-0000-4000-8000-00000000000${n}`, name, role, phone: `0812 0000 000${n}`, photo: { url: photo, alt: name, srcset: [] }, active, sort_order: n });
  const team = [person(1, "Contoh Raka Pratama", "Hospitality", "https://picsum.photos/seed/wk-staf1/200/200"), person(2, "Contoh Sari Dewi", "Sales"), person(3, "Contoh Budi", "Driver", "", false)];
  return <AdminShell bare><h1>Dashboard super admin (contoh)</h1><StaffSettings initial={team} migrated /><ModuleSettings initialDisabled={["team", "review"]} migrated /></AdminShell>;
}

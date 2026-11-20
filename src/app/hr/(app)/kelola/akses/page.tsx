import { ConsoleTheme } from "@/components/console";
import { ManageAccess } from "@/components/hr/ManageAccess";
import hr from "@/components/hr/hr.module.css";
import { hrPath } from "@/lib/routes";
import { hrAccessList, requireHrAdminPage } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Akses" };

/** Kelola → Akses (Admin HR): who else is Admin HR. */
export default async function HrAccessPage() {
  const member = await requireHrAdminPage(hrPath.manageAccess);
  return <ConsoleTheme canvas className={hr.manage}><ManageAccess people={await hrAccessList()} meId={member.id} /></ConsoleTheme>;
}

import { ConsoleTheme } from "@/components/console";
import { ManageOffices } from "@/components/hr/ManageOffices";
import hr from "@/components/hr/hr.module.css";
import { Notice } from "@/components/ui";
import { hrPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { listOffices } from "@/lib/server/hr/attendance";
import { requireHrAdminPage } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Titik kantor" };

/** Kelola → Titik kantor (Admin HR): the office points and their radius for absensi. */
export default async function HrOfficesPage() {
  await requireHrAdminPage(hrPath.manageOffices);
  const offices = await listOffices().catch((error: unknown) => {
    if (error instanceof ServiceError && error.status === 503) return error;
    throw error;
  });
  return <ConsoleTheme canvas className={hr.manage}>
    {offices instanceof ServiceError ? <Notice tone="warning">{offices.message}</Notice> : <ManageOffices initial={offices} />}
  </ConsoleTheme>;
}

import { ConsoleTheme } from "@/components/console";
import { ManageAttendance } from "@/components/hr/ManageAttendance";
import hr from "@/components/hr/hr.module.css";
import { Notice } from "@/components/ui";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { hrPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { adminDay, listFaces } from "@/lib/server/hr/attendance";
import { requireHrAdminPage } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kelola absen" };

/** Kelola (Admin HR): the day's clock-ins to check and the registered faces. ?tanggal= opens another day. */
export default async function HrManagePage({ searchParams }: { searchParams: Promise<{ tanggal?: string }> }) {
  await requireHrAdminPage(hrPath.manage());
  const { tanggal } = await searchParams;
  const date = tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? tanggal : wibDate(new Date().toISOString());
  // Before the migration: say what it waits for instead of failing.
  const data = await Promise.all([adminDay(date), listFaces()]).catch((error: unknown) => {
    if (error instanceof ServiceError && error.status === 503) return error;
    throw error;
  });
  return <ConsoleTheme canvas className={hr.manage}>
    {data instanceof ServiceError ? <Notice tone="warning">{data.message}</Notice> : <ManageAttendance initial={data[0]} faces={data[1]} />}
  </ConsoleTheme>;
}

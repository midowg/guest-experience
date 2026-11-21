import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { HrAdminFrame } from "@/components/hr-admin/HrAdminFrame";
import { hrAdminSection } from "@/components/hr-admin/sections";
import { Notice } from "@/components/ui";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { DayAttendance } from "@/components/hr-admin/DayAttendance";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { adminDayTable } from "@/lib/server/hr/leave";

export const dynamic = "force-dynamic";
export const metadata = { title: `${hrAdminSection("absen").label} · Admin HR` };

/** Before the migration a 503 says what it waits for; anything else is a real error. */
const waitingFor = (error: unknown) => {
  if (error instanceof ServiceError && error.status === 503) return error;
  throw error;
};

/** Admin HR → Absen harian: everyone on one day; ?tanggal= opens another day. */
export default async function HrAdminDay({ searchParams }: { searchParams: Promise<{ tanggal?: string }> }) {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const today = wibDate(new Date().toISOString());
  const { tanggal } = await searchParams;
  const date = tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) && tanggal <= today ? tanggal : today;
  const data = await adminDayTable(date, today).catch(waitingFor);
  return <HrAdminFrame current="absen">
    {data instanceof ServiceError ? <Notice tone="warning">{data.message}</Notice> : <DayAttendance initial={data} today={today} />}
  </HrAdminFrame>;
}

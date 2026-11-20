import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { HrAdminFrame } from "@/components/hr-admin/HrAdminFrame";
import { hrAdminSection } from "@/components/hr-admin/sections";
import { Notice } from "@/components/ui";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { HrOverview } from "@/components/hr-admin/HrOverview";
import { wibDate } from "@/lib/pra-wam/appraisal";
import { hrSummary, waitingRecords } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";
export const metadata = { title: `${hrAdminSection("ringkasan").label} · Admin HR` };

/** Before the migration a 503 says what it waits for; anything else is a real error. */
const waitingFor = (error: unknown) => {
  if (error instanceof ServiceError && error.status === 503) return error;
  throw error;
};

/** Admin HR → Ringkasan (20 Nov 2026): today, what to set up, and what waits. */
export default async function HrAdminHome() {
  const role = await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const data = await Promise.all([hrSummary(wibDate(new Date().toISOString())), waitingRecords()]).catch(waitingFor);
  return <HrAdminFrame current="ringkasan">
    {data instanceof ServiceError ? <Notice tone="warning">{data.message}</Notice> : <HrOverview summary={data[0]} waiting={data[1].slice(0, 5)} superAdmin={role === "super"} />}
  </HrAdminFrame>;
}

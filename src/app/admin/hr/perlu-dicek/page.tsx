import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { HrAdminFrame } from "@/components/hr-admin/HrAdminFrame";
import { hrAdminSection } from "@/components/hr-admin/sections";
import { Notice } from "@/components/ui";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { ReviewQueue } from "@/components/hr-admin/ReviewQueue";
import { waitingRecords } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";
export const metadata = { title: `${hrAdminSection("perlu").label} · Admin HR` };

/** Before the migration a 503 says what it waits for; anything else is a real error. */
const waitingFor = (error: unknown) => {
  if (error instanceof ServiceError && error.status === 503) return error;
  throw error;
};

/** Admin HR → Perlu dicek: every clock-in that waits, to approve or refuse. */
export default async function HrAdminWaiting() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const data = await waitingRecords().catch(waitingFor);
  return <HrAdminFrame current="perlu">
    {data instanceof ServiceError ? <Notice tone="warning">{data.message}</Notice> : <ReviewQueue initial={data} />}
  </HrAdminFrame>;
}

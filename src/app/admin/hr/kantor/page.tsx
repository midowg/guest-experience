import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { HrAdminFrame } from "@/components/hr-admin/HrAdminFrame";
import { hrAdminSection } from "@/components/hr-admin/sections";
import { Notice } from "@/components/ui";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { OfficePoints } from "@/components/hr-admin/OfficePoints";
import { listOffices } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";
export const metadata = { title: `${hrAdminSection("kantor").label} · Admin HR` };

/** Before the migration a 503 says what it waits for; anything else is a real error. */
const waitingFor = (error: unknown) => {
  if (error instanceof ServiceError && error.status === 503) return error;
  throw error;
};

/** Admin HR → Titik kantor: the office points and their radius. */
export default async function HrAdminOffices() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const data = await listOffices().catch(waitingFor);
  return <HrAdminFrame current="kantor">
    {data instanceof ServiceError ? <Notice tone="warning">{data.message}</Notice> : <OfficePoints initial={data} />}
  </HrAdminFrame>;
}

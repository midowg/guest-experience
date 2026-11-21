import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { HrAdminFrame } from "@/components/hr-admin/HrAdminFrame";
import { RequestQueue } from "@/components/hr-admin/RequestQueue";
import { hrAdminSection } from "@/components/hr-admin/sections";
import { Notice } from "@/components/ui";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminRequests } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";
export const metadata = { title: `${hrAdminSection("revisi").label} · Admin HR` };

/** Admin HR → Revisi: what employees ask to fix, to approve (applied at once) or refuse. */
export default async function HrAdminRequests() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const data = await adminRequests().catch((error: unknown) => {
    if (error instanceof ServiceError && error.status === 503) return error;
    throw error;
  });
  return <HrAdminFrame current="revisi">
    {data instanceof ServiceError ? <Notice tone="warning">{data.message}</Notice> : <RequestQueue initial={data} />}
  </HrAdminFrame>;
}

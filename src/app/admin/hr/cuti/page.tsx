import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { HrAdminFrame } from "@/components/hr-admin/HrAdminFrame";
import { LeaveQueue } from "@/components/hr-admin/LeaveQueue";
import { hrAdminSection } from "@/components/hr-admin/sections";
import { Notice } from "@/components/ui";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { adminLeaves, leavePeople } from "@/lib/server/hr/leave";

export const dynamic = "force-dynamic";
export const metadata = { title: `${hrAdminSection("cuti").label} · Admin HR` };

/** Admin HR → Cuti & izin: cuti, sakit, izin and dinas asked for, to approve or refuse. */
export default async function HrAdminLeaves() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const data = await Promise.all([adminLeaves(), leavePeople()]).catch((error: unknown) => {
    if (error instanceof ServiceError && error.status === 503) return error;
    throw error;
  });
  return <HrAdminFrame current="cuti">
    {data instanceof ServiceError ? <Notice tone="warning">{data.message}</Notice> : <LeaveQueue initial={data[0]} people={data[1]} />}
  </HrAdminFrame>;
}

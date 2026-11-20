import { AdminShell, SetupNotice } from "@/components/admin/shared/AdminShell";
import { HrAdminFrame } from "@/components/hr-admin/HrAdminFrame";
import { hrAdminSection } from "@/components/hr-admin/sections";
import { Notice } from "@/components/ui";
import { isSupabaseConfigured, ServiceError } from "@/lib/server/config";
import { requireAdminPage } from "@/lib/server/admin-session";
import { FaceList } from "@/components/hr-admin/FaceList";
import { listFaces } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";
export const metadata = { title: `${hrAdminSection("wajah").label} · Admin HR` };

/** Before the migration a 503 says what it waits for; anything else is a real error. */
const waitingFor = (error: unknown) => {
  if (error instanceof ServiceError && error.status === 503) return error;
  throw error;
};

/** Admin HR → Wajah terdaftar: the reference faces, approving them, Proses foto impor. */
export default async function HrAdminFaces() {
  await requireAdminPage();
  if (!isSupabaseConfigured()) return <AdminShell><SetupNotice /></AdminShell>;
  const data = await listFaces().catch(waitingFor);
  return <HrAdminFrame current="wajah">
    {data instanceof ServiceError ? <Notice tone="warning">{data.message}</Notice> : <FaceList initial={data} />}
  </HrAdminFrame>;
}

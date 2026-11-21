import { z } from "zod";
import { leaveLabels, leaveSchema } from "@/lib/hr/leave";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { hrAdminActor } from "@/lib/server/hr/session";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { adminCreateLeave, adminLeaves } from "@/lib/server/hr/leave";

export const dynamic = "force-dynamic";

/** GET: the waiting cuti, sakit, izin and dinas requests first, then the last decided ones. */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await adminLeaves(), "");
  });
}

/** POST {employeeId, type, startDate, endDate, note}: Admin HR records one for an employee, approved at once. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const body = await readJson(request, 2_000);
    const { employeeId } = validate(z.object({ employeeId: z.uuid("Pilih karyawan.") }), body);
    const created = await adminCreateLeave(employeeId, validate(leaveSchema, body), await hrAdminActor());
    return success(created, `${leaveLabels[created.type]} ${created.name} dicatat dan disetujui.`);
  });
}

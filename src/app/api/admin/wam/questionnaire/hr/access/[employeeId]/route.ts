import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { changeHrAccess } from "@/lib/server/pra-wam/hr-lock";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };

/** DELETE: a super admin takes one person's Data HR access away; an unlock they hold ends at once (logged). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const role = await requireApiAdmin();
    if (role !== "super") throw new ServiceError(403, "Hanya super admin yang bisa mengubah akses Data HR.");
    checkOrigin(request);
    const employeeId = validate(z.uuid(), (await params).employeeId);
    return success(await changeHrAccess(request, employeeId, "remove"), "Akses Data HR dicabut.");
  });
}

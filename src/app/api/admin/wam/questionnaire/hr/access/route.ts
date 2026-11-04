import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { changeHrAccess } from "@/lib/server/pra-wam/hr-lock";

export const dynamic = "force-dynamic";
const schema = z.object({ employeeId: z.uuid("Pilih karyawan dari daftar.") });

/**
 * POST {employeeId}: a super admin gives one person access to Data HR (logged). The role is checked
 * here rather than with the super-admin helper, as Admin WAM's guard test expects every WAM admin
 * route to start from the admin session.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const role = await requireApiAdmin();
    if (role !== "super") throw new ServiceError(403, "Hanya super admin yang bisa mengubah akses Data HR.");
    checkOrigin(request);
    const { employeeId } = validate(schema, await readJson(request, 2_000));
    return success(await changeHrAccess(request, employeeId, "add"), "Akses Data HR ditambahkan.");
  });
}

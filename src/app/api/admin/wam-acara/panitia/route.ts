import { currentAdmin, requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { staffAddSchema } from "@/lib/main-wam/staff";
import { listWamStaff, saveWamStaff } from "@/lib/server/main-wam/staff";

export const dynamic = "force-dynamic";

/** GET: Panitia WAM (Admin WAM 2027, KONTRAK §15). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await listWamStaff());
  });
}

/** POST {employeeId, seksi}: one more person on Panitia WAM, or a new seksi for someone on it. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { employeeId, seksi } = validate(staffAddSchema, await readJson(request, 1_000));
    const actor = await currentAdmin();
    const done = await saveWamStaff(employeeId, seksi, actor?.name ?? (actor?.role === "super" ? "Super admin" : "Admin"));
    return success(await listWamStaff(), done === "added" ? "Ditambahkan ke Panitia WAM." : "Seksi diubah.");
  });
}

import { z } from "zod";
import { ServiceError } from "@/lib/server/config";
import { currentAdmin, requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { staffSeksiSchema } from "@/lib/main-wam/staff";
import { listWamStaff, removeWamStaff, saveWamStaff } from "@/lib/server/main-wam/staff";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };

async function personOf(params: Params["params"]): Promise<string> {
  const { employeeId } = await params;
  if (!z.uuid().safeParse(employeeId).success) throw new ServiceError(404, "Panitia tidak ditemukan.");
  return employeeId;
}

/** PATCH {seksi}: change one person's seksi (a label only). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const employeeId = await personOf(params);
    const { seksi } = validate(staffSeksiSchema, await readJson(request, 1_000));
    const actor = await currentAdmin();
    await saveWamStaff(employeeId, seksi, actor?.name ?? "Admin", { onlyChange: true });
    return success(await listWamStaff(), "Seksi diubah.");
  });
}

/** DELETE: one person off Panitia WAM (their WAM account and Pra WAM roles stay). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const employeeId = await personOf(params);
    await removeWamStaff(employeeId);
    return success(await listWamStaff(), "Dihapus dari Panitia WAM.");
  });
}

import { z } from "zod";
import { ServiceError } from "@/lib/server/config";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { listTesters, removeTester } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };

/** DELETE: one person off the penguji list (panitia and admin stay penguji by their role). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { employeeId } = await params;
    if (!z.uuid().safeParse(employeeId).success) throw new ServiceError(404, "Penguji tidak ditemukan.");
    await removeTester(employeeId);
    return success(await listTesters(), "Penguji dihapus dari daftar.");
  });
}

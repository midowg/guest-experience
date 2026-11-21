import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { removeHost } from "@/lib/server/main-wam/kuis/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; employeeId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id, employeeId } = await params;
    await removeHost(validate(z.uuid("Kuis tidak dikenali."), id), validate(z.uuid("Orang tidak dikenali."), employeeId));
    return success(null, "Pengendali dihapus.");
  });
}

import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { deleteManualEntry } from "@/lib/server/main-wam/misi/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** DELETE: take a manual points entry back (entries from missions go with their completion instead). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await deleteManualEntry(validate(z.uuid("Catatan poin tidak dikenali."), (await params).id));
    return success(null, "Catatan poin dihapus.");
  });
}

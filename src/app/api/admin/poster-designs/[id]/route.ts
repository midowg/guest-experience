import { z } from "zod";
import { deletePosterDesign } from "@/lib/server/poster-designs";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    await deletePosterDesign(validate(z.uuid(), (await params).id));
    return success(null, "Desain poster dihapus dari pustaka.");
  });
}

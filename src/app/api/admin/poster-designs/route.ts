import { posterDesignInputSchema } from "@/lib/validation";
import { createPosterDesign, listPosterDesigns } from "@/lib/server/poster-designs";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireSuperAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";

/** GET: saved poster designs (any admin, to start an event's poster from one). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await listPosterDesigns(), "Desain poster dimuat.");
  });
}

/** POST: save an event's poster as a design (super admin). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    return success(await createPosterDesign(validate(posterDesignInputSchema, await readJson(request, 250_000))), "Desain poster disimpan ke pustaka.");
  });
}

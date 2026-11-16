import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { updateCatalogItem } from "@/lib/server/wellbeing/admin";
import { catalogItemSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ code: string }> };
const code = z.string().regex(/^[a-z]+\.[a-z0-9_]{2,60}$/);

/** PATCH: change a kind of activity (name, points, limit, active). Logged activities keep their points. */
export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const parsed = code.safeParse(decodeURIComponent((await params).code));
    if (!parsed.success) throw new ServiceError(404, "Jenis kegiatan tidak ditemukan.");
    const input = validate(catalogItemSchema, await readJson(request, 4_000));
    return success(await updateCatalogItem(parsed.data, input), "Jenis kegiatan disimpan.");
  });
}

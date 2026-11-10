import { tvOrderSchema } from "@/lib/pra-wam/tv";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { orderSlides, tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

/** PUT {ids}: every picture, in the order TVs play them (any admin). */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await orderSlides(validate(tvOrderSchema, await readJson(request, 4_000)).ids);
    return success(await tvAdmin(), "Urutan tersimpan.");
  });
}

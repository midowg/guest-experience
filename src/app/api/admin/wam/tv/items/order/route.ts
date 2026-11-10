import { tvItemOrderSchema } from "@/lib/pra-wam/tv";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { orderItems, tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

/** PUT {ids}: every row of the playlist, in the order TVs play them (any admin). */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await orderItems(validate(tvItemOrderSchema, await readJson(request, 12_000)).ids);
    return success(await tvAdmin(), "Urutan tersimpan.");
  });
}

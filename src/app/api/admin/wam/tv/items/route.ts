import { tvItemCreateSchema } from "@/lib/pra-wam/tv";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { createItem, tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

/** POST {kind, title?, body?}: a template fed by WAM (one of each) or a text joins the playlist, last (any admin). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await createItem(validate(tvItemCreateSchema, await readJson(request, 4_000)));
    return success(await tvAdmin(), "Tayangan ditambahkan di urutan terakhir.");
  });
}

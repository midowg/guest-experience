import { z } from "zod";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { reloadScreen, tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const schema = z.object({ id: z.uuid() });

/** POST: ask one TV to load its page afresh; it does so the next time it asks, while it is on (any admin). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id } = validate(schema, await params);
    await reloadScreen(id);
    return success(await tvAdmin(), "TV diminta memuat ulang. Kalau sedang menyala, ia melakukannya dalam sepuluh detik.");
  });
}

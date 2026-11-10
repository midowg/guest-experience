import { tvScreenSchema } from "@/lib/pra-wam/tv";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { createScreen, tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

/** POST {name, slug}: a new TV at /tv/{slug} (any admin). The address is open: whoever knows it sees the board. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { name, slug } = validate(tvScreenSchema, await readJson(request, 2_000));
    await createScreen(name, slug);
    return success(await tvAdmin(), "TV ditambahkan. Buka alamatnya di browser TV.");
  });
}

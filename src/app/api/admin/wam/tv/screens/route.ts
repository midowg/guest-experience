import { tvScreenSchema } from "@/lib/pra-wam/tv";
import { tvPath } from "@/lib/routes";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { createScreen, tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

/** POST {name}: a new TV (any admin). The answer holds its address, shown once; only the key's hash is kept. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { name } = validate(tvScreenSchema, await readJson(request, 2_000));
    const key = await createScreen(name);
    return success({ ...(await tvAdmin()), created: { name, path: tvPath(key) } }, "TV ditambahkan. Salin tautannya sekarang; tautan ini tidak ditampilkan lagi.");
  });
}

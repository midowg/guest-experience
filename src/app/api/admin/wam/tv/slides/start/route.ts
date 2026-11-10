import { tvSlideStartSchema } from "@/lib/pra-wam/tv";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { startSlideUpload } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

/** POST {mime, size}: an upload address for one TV picture, and a token to confirm it with (any admin). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    return success(await startSlideUpload(validate(tvSlideStartSchema, await readJson(request, 2_000))), "Alamat unggah siap.");
  });
}

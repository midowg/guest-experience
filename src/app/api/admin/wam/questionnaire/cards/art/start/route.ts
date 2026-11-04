import { artStartSchema } from "@/lib/pra-wam/cards";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { startArtUpload } from "@/lib/server/pra-wam/cards-admin";

export const dynamic = "force-dynamic";

/** POST {kind, ref, mime, size}: an upload address for one picture of the card catalog (any admin). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    return success(await startArtUpload(validate(artStartSchema, await readJson(request, 2_000))), "Siap mengunggah.");
  });
}

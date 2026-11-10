import { tvSlideConfirmSchema } from "@/lib/pra-wam/tv";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { confirmSlideUpload, tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

/** POST: the picture is uploaded; check it and add it to the end of the loop (any admin). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await confirmSlideUpload(validate(tvSlideConfirmSchema, await readJson(request, 4_000)));
    return success(await tvAdmin(), "Gambar ditambahkan.");
  });
}

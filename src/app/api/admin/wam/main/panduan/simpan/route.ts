import { guideFileConfirmSchema } from "@/lib/main-wam/admin/guides";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { confirmGuideFile } from "@/lib/server/main-wam/admin/guides";

export const dynamic = "force-dynamic";

/** POST {guideId, key, token, mime, size}: the file is uploaded; check it and link it to the guide. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(guideFileConfirmSchema, await readJson(request, 2_000));
    return success(await confirmGuideFile(input), "Berkas panduan tersimpan.");
  });
}

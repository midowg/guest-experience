import { guideFileStartSchema } from "@/lib/main-wam/admin/guides";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { startGuideFile } from "@/lib/server/main-wam/admin/guides";

export const dynamic = "force-dynamic";

/** POST {guideId, mime, size}: where to upload a guide's file, and the token to confirm it with. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(guideFileStartSchema, await readJson(request, 1_000));
    await enforceRateLimit(request, "mw-admin-panduan-unggah", 60);
    return success(await startGuideFile(input), "Siap diunggah.");
  });
}

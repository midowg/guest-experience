import { checklistPhotoStartSchema } from "@/lib/main-wam/ceklis/ceklis";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { startChecklistPhoto } from "@/lib/server/main-wam/admin/ceklis";

export const dynamic = "force-dynamic";

/** POST {mime, size}: where to upload a checklist item's photo, and the token to confirm it with. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(checklistPhotoStartSchema, await readJson(request, 1_000));
    await enforceRateLimit(request, "mw-admin-ceklis-unggah", 120);
    return success(await startChecklistPhoto(input), "Siap diunggah.");
  });
}

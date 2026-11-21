import { checklistPhotoConfirmSchema } from "@/lib/main-wam/ceklis/ceklis";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { confirmChecklistPhoto } from "@/lib/server/main-wam/admin/ceklis";

export const dynamic = "force-dynamic";

/** POST {key, token, mime, size}: the photo is uploaded; check it. The checklist's own save then links it to its item. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(checklistPhotoConfirmSchema, await readJson(request, 2_000));
    return success(await confirmChecklistPhoto(input), "Foto siap.");
  });
}

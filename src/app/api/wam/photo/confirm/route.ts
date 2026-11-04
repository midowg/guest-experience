import { photoConfirmSchema } from "@/lib/pra-wam/photo";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { confirmPhotoUpload } from "@/lib/server/pra-wam/photos";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: the browser finished uploading; check the photo and keep it on the account. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    return success(await confirmPhotoUpload(validate(photoConfirmSchema, await readJson(request, 2_000)), member), "Foto profil diganti.");
  });
}

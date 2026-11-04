import { checkOrigin, handle, success } from "@/lib/server/http";
import { removePhoto } from "@/lib/server/pra-wam/photos";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** DELETE: the person removes their own profile photo; initials show again. */
export async function DELETE(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await removePhoto(member);
    return success(null, "Foto profil dihapus.");
  });
}

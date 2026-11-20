import { checkOrigin, handle, success } from "@/lib/server/http";
import { withdrawFace } from "@/lib/server/hr/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** DELETE: Data wajah → Hapus. The person's face reference and kept selfies are deleted. */
export async function DELETE(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await withdrawFace(member);
    return success(null, "Data wajahmu sudah dihapus. Absenmu akan dicatat Admin HR.");
  });
}

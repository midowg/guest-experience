import { z } from "zod";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { deleteAnnouncement } from "@/lib/server/pra-wam/announcements";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** DELETE: panitia removes an announcement; it leaves every recipient's list too. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await deleteAnnouncement(validate(z.uuid(), (await params).id), member);
    return success(null, "Pengumuman dihapus.");
  });
}

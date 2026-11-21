import { z } from "zod";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { cancelLeave } from "@/lib/server/hr/leave";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** DELETE: the employee withdraws their own cuti/sakit/izin/dinas request while it still waits. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await cancelLeave(member, validate(z.uuid(), (await params).id));
    return success(null, "Pengajuan dibatalkan.");
  });
}

import { z } from "zod";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { cancelRequest } from "@/lib/server/hr/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** DELETE: the employee withdraws their own request while it still waits. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await cancelRequest(member, validate(z.uuid(), (await params).id));
    return success(null, "Revisi dibatalkan.");
  });
}

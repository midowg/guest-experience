import { z } from "zod";
import { cancelClaim } from "@/lib/server/coffee/claims";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** DELETE: the person cancels their own claim while it is still being processed. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const id = validate(z.uuid("Pengajuan tidak dikenali."), (await params).id);
    return success(await cancelClaim(member, id), "Pengajuan dibatalkan. Jatah kamu dikembalikan.");
  });
}

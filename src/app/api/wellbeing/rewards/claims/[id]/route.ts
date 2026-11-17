import { z } from "zod";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { ServiceError } from "@/lib/server/config";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { cancelClaim } from "@/lib/server/wellbeing/rewards";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

/** POST: cancel my claim while it still waits (the points come back). */
export async function POST(request: Request, { params }: Context) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const id = z.string().uuid().safeParse((await params).id);
    if (!id.success) throw new ServiceError(404, "Klaim tidak ditemukan.");
    return success(await cancelClaim(member, id.data), "Klaim dibatalkan. Poinnya kembali ke saldo.");
  });
}
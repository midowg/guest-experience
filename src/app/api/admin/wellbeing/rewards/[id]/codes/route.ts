import { z } from "zod";
import { handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { rewardCodes } from "@/lib/server/wellbeing/rewards";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

/** GET: a voucher's unique codes, oldest first, and who got each (Jenis hadiah, 18 Nov 2026). Added and taken off with the reward's PATCH. */
export async function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    await requireApiAdmin();
    const id = z.string().uuid().safeParse((await params).id);
    if (!id.success) throw new ServiceError(404, "Hadiah tidak ditemukan.");
    return success(await rewardCodes(id.data));
  });
}

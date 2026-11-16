import { z } from "zod";
import { ServiceError } from "@/lib/server/config";
import { handle, success } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { myActivity } from "@/lib/server/wellbeing/member";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

/** GET: one of my activities (someone else's is 404). */
export async function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    const member = await requireApiMember();
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ServiceError(404, "Aktivitas tidak ditemukan.");
    return success(await myActivity(member, id.data), "Aktivitas dimuat.");
  });
}

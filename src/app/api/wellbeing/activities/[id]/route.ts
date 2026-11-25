import { z } from "zod";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { myActivity, updateMyActivity } from "@/lib/server/wellbeing/member";
import { editSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function idOf(params: Context["params"]) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new ServiceError(404, "Aktivitas tidak ditemukan.");
  return id.data;
}

/** GET: one of my activities (someone else's is 404). */
export async function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    const member = await requireApiMember();
    return success(await myActivity(member, await idOf(params)), "Aktivitas dimuat.");
  });
}

/** PATCH: Ubah, my activity changed while the admin has not checked it (25 Nov 2026); 409 once checked. */
export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const id = await idOf(params);
    const input = validate(editSchema, await readJson(request, 20_000));
    return success(await updateMyActivity(member, id, input), "Aktivitas diperbarui.");
  });
}

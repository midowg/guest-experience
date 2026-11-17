import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { wellbeingActor } from "@/lib/server/wellbeing/admin";
import { deleteReward, updateReward } from "@/lib/server/wellbeing/rewards";
import { rewardInputSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
const rewardId = async (params: Context["params"]) => {
  const parsed = z.string().uuid().safeParse((await params).id);
  if (!parsed.success) throw new ServiceError(404, "Hadiah tidak ditemukan.");
  return parsed.data;
};

/** PATCH: change a reward (claims keep the price they were made at). */
export async function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = await rewardId(params);
    const input = validate(rewardInputSchema, await readJson(request, 20_000));
    return success(await updateReward(id, input, await wellbeingActor()), "Hadiah disimpan.");
  });
}

/** DELETE: a reward nobody ever claimed. */
export async function DELETE(request: Request, { params }: Context) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await deleteReward(await rewardId(params));
    return success({ deleted: true }, "Hadiah dihapus.");
  });
}
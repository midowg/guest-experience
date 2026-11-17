import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { wellbeingActor } from "@/lib/server/wellbeing/admin";
import { adminRewards, createReward } from "@/lib/server/wellbeing/rewards";
import { rewardInputSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";

/** GET: every reward, the claims, and how many in each status (Hadiah, 18 Nov 2026). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await adminRewards());
  });
}

/** POST: a new reward (its photos uploaded first through /rewards/uploads). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(rewardInputSchema, await readJson(request, 20_000));
    return success(await createReward(input, await wellbeingActor()), input.active ? "Hadiah ditambahkan dan tampil di aplikasi karyawan." : "Hadiah disimpan sebagai draf (belum tampil).");
  });
}
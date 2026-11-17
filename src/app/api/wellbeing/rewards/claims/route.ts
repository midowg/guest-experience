import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { requestReward } from "@/lib/server/wellbeing/rewards";
import { claimRequestSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";

/** POST { rewardId, note }: ask for a reward; its points are held from the saldo until the admin decides. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, `wellbeing-claim:${member.id}`, 10);
    const result = await requestReward(member, validate(claimRequestSchema, await readJson(request, 2_000)));
    return success(result, `Klaim ${result.claim.title} terkirim. Admin akan memprosesnya.`);
  });
}
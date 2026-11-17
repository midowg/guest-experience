import { handle, success } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { myRewards } from "@/lib/server/wellbeing/rewards";

export const dynamic = "force-dynamic";

/** GET: my saldo, the rewards that are on, and my claims (Hadiah, 18 Nov 2026). */
export async function GET() {
  return handle(async () => {
    const member = await requireApiMember();
    return success(await myRewards(member));
  });
}
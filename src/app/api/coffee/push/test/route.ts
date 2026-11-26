import { sendTestPush } from "@/lib/server/coffee/push";
import { COFFEE_NETWORK_LIMIT, limitCoffeePerson } from "@/lib/server/coffee/rate";
import { checkOrigin, enforceRateLimit, handle, success } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: one test notification to the signed-in person's own devices. At most ten in ten minutes. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "coffee-push-tes", COFFEE_NETWORK_LIMIT);
    await limitCoffeePerson("push-tes", member.id, 10);
    await sendTestPush(member.id);
    return success(null, "Notifikasi tes dikirim.");
  });
}

import { checkOrigin, enforceRateLimit, handle, success } from "@/lib/server/http";
import { startEnroll } from "@/lib/server/hr/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: enrolment, step one: a nonce and its liveness steps. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "hr-wajah", 20);
    return success(await startEnroll(member), "");
  });
}

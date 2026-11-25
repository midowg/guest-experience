import { myState } from "@/lib/server/coffee/claims";
import { handle, success } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** GET: the person's quota this month and their claims. The app polls this while a claim is being processed. */
export async function GET() {
  return handle(async () => {
    const member = await requireApiMember();
    return success(await myState(member), "");
  });
}

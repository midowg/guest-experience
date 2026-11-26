import { requireApiAdmin } from "@/lib/server/admin-session";
import { queue } from "@/lib/server/coffee/queue";
import { coffeeActor } from "@/lib/server/coffee/session";
import { handle, success } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET: what waits (oldest first), the last six processed, and today's numbers. Polled every ten seconds. */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await queue(await coffeeActor()), "");
  });
}

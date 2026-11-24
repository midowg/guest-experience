import { requireApiAdmin } from "@/lib/server/admin-session";
import { handle, success } from "@/lib/server/http";
import { listReviewQueue } from "@/lib/server/main-wam/misi/review";

export const dynamic = "force-dynamic";

/** GET: the proofs waiting for a person (photo address, TNC, automatic checks, tags). Decide with PATCH on penyelesaian/[id]. */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success({ items: await listReviewQueue() }, "");
  });
}

import { handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { adminRequests } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";

/** GET: the waiting revision requests first, then the last decided ones. */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await adminRequests(), "");
  });
}

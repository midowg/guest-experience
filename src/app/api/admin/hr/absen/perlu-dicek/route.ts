import { handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { waitingRecords } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";

/** GET: every clock-in that waits, newest first. */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await waitingRecords(), "");
  });
}

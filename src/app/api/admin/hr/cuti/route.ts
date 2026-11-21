import { handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { adminLeaves } from "@/lib/server/hr/leave";

export const dynamic = "force-dynamic";

/** GET: the waiting cuti, sakit, izin and dinas requests first, then the last decided ones. */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await adminLeaves(), "");
  });
}

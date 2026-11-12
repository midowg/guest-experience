import { requireApiAdmin } from "@/lib/server/admin-session";
import { handle, success } from "@/lib/server/http";
import { momCabinet } from "@/lib/server/pra-wam/mom-cabinet";

export const dynamic = "force-dynamic";

/** GET: Admin WAM → Arsip MoM (any admin): every sent MoM with its photos, newest first. */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await momCabinet(), "");
  });
}

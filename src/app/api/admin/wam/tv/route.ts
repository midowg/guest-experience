import { handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

/** GET: the TVs with when each was last seen, the pictures, and the settings (any admin). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await tvAdmin(), "TV Announcement dimuat.");
  });
}

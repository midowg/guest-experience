import { praWamTvApi } from "@/lib/routes";
import { handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { tvFeed } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

/** GET: what a TV would play now, for the admin's preview (pictures through the admin API). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await tvFeed(praWamTvApi.slideImage), "Pratinjau dimuat.");
  });
}

import { handle, success } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { loadMisi } from "@/lib/server/main-wam/misi/read";

export const dynamic = "force-dynamic";

/**
 * GET: my points, my place, and the missions with my state. Module Misi on, and not a BOD (404 for
 * both: "not for you"). Where a mission is, and who else did it, is not in the answer.
 */
export async function GET() {
  return handle(async () => {
    const context = await requireActionApi("misi");
    const data = await loadMisi(context, new Date());
    return success(data, "");
  });
}

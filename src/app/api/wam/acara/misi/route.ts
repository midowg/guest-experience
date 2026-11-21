import { handle, success } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { loadMisi } from "@/lib/server/main-wam/misi/read";

export const dynamic = "force-dynamic";

const withoutSettings = ({ settings, ...view }: Awaited<ReturnType<typeof loadMisi>>) => (void settings, view);

/**
 * GET: my points, my place, and the missions with my state. Module Misi on, and not a BOD (404 for
 * both: "not for you"). Where a mission is, and who else did it, is not in the answer; nor are the admin
 * settings (radius and accuracy limits), which only the server needs. `place` is null while Peringkat is closed.
 */
export async function GET() {
  return handle(async () => {
    const context = await requireActionApi("misi");
    const view = withoutSettings(await loadMisi(context, new Date()));
    return success(view, "");
  });
}

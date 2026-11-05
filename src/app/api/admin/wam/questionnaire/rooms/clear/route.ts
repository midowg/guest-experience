import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { requireHrUnlocked } from "@/lib/server/pra-wam/hr-lock";
import { clearPlacements } from "@/lib/server/pra-wam/stay";

export const dynamic = "force-dynamic";

/** POST: everyone back to waiting; the rooms stay. Admin + Data HR open. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const unlock = await requireHrUnlocked();
    await clearPlacements(unlock);
    return success(null, "Semua penghuni dikosongkan.");
  });
}

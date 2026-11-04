import { requireApiAdmin } from "@/lib/server/admin-session";
import { handle, success } from "@/lib/server/http";
import { hrAccessLog, requireHrUnlocked, sameOriginRead } from "@/lib/server/pra-wam/hr-lock";

export const dynamic = "force-dynamic";

/** GET: the latest 50 HR access log rows (admin + HR unlock). */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    sameOriginRead(request);
    const unlock = await requireHrUnlocked();
    return success(await hrAccessLog(unlock), "Log dimuat.");
  });
}

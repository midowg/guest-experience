import { requireApiAdmin } from "@/lib/server/admin-session";
import { handle, success } from "@/lib/server/http";
import { hrPeople, requireHrUnlocked, sameOriginRead } from "@/lib/server/pra-wam/hr-lock";

export const dynamic = "force-dynamic";

/** GET: who answered any HR question, with how many (admin + HR unlock). */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    sameOriginRead(request);
    const unlock = await requireHrUnlocked();
    return success(await hrPeople(unlock), "Daftar dimuat.");
  });
}

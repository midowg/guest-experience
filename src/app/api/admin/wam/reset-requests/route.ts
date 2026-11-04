import { handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { listResetRequests } from "@/lib/server/pra-wam/reset-requests";

export const dynamic = "force-dynamic";

/** GET: open "Lupa password" requests and the last ones handled (any admin). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await listResetRequests(), "Permintaan reset dimuat.");
  });
}

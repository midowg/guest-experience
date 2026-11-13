import { listGrants } from "@/lib/server/admin-actor";
import { requireSuperAdmin } from "@/lib/server/admin-session";
import { handle, success } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET: every admin's grant (super admin, 13 Nov 2026). */
export async function GET() {
  return handle(async () => {
    await requireSuperAdmin();
    return success(await listGrants(), "Akses admin dimuat.");
  });
}

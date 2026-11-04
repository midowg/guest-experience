import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { resetHrPassword } from "@/lib/server/pra-wam/hr-lock";

export const dynamic = "force-dynamic";

/**
 * POST: a super admin clears a forgotten HR password so a new one can be set; every unlock ends.
 * The role is checked here rather than with the super-admin helper, as Admin WAM's guard test
 * expects every WAM admin route to start from the admin session.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const role = await requireApiAdmin();
    if (role !== "super") throw new ServiceError(403, "Hanya super admin yang dapat mengatur ulang password HR.");
    checkOrigin(request);
    await resetHrPassword(request);
    return success(null, "Password HR diatur ulang. Atur password HR baru sebelum Data HR bisa dibuka lagi.");
  });
}

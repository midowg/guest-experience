import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { lockHr } from "@/lib/server/pra-wam/hr-lock";

export const dynamic = "force-dynamic";

/** POST: "Kunci sekarang" on this browser (logged when it was open). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await lockHr(request);
    return success(null, "Data HR dikunci.");
  });
}

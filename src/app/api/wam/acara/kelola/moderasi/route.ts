import { handle, success } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { apiOnlyFor } from "@/lib/server/main-wam/panitia/common";
import { moderationData } from "@/lib/server/main-wam/panitia/moderation";

export const dynamic = "force-dynamic";

/** GET: reported and hidden photos (K08, panitia), with short-lived addresses of the photos. */
export async function GET() {
  return handle(async () => {
    apiOnlyFor(await requireMainWamApi(), "kelola");
    return success(await moderationData(), "Moderasi dimuat.");
  });
}

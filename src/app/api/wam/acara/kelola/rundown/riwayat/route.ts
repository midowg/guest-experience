import { handle, success } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { apiOnlyFor } from "@/lib/server/main-wam/panitia/common";
import { rundownHistory } from "@/lib/server/main-wam/panitia/rundown";

export const dynamic = "force-dynamic";

/** GET: Riwayat perubahan of Rundown live, newest first (panitia). */
export async function GET() {
  return handle(async () => {
    apiOnlyFor(await requireMainWamApi(), "kelola");
    return success(await rundownHistory(), "Riwayat dimuat.");
  });
}

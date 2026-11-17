import { handle, success } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { apiOnlyFor, limitPerPerson } from "@/lib/server/main-wam/panitia/common";
import { bodSummary } from "@/lib/server/main-wam/panitia/summary";

export const dynamic = "force-dynamic";

/** GET: BOD's Ringkasan (at most 4 rows; a module that is off has none). BOD only. */
export async function GET() {
  return handle(async () => {
    const context = apiOnlyFor(await requireMainWamApi(), "ringkasan");
    await limitPerPerson("ringkasan", context.viewer.id, 120);
    return success(await bodSummary(context), "Ringkasan dimuat.");
  });
}

import { handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { wellbeingOverview } from "@/lib/server/wellbeing/admin";

export const dynamic = "force-dynamic";

/** GET: Admin Wellbeing → Hari ini (what needs doing, this month, last month's champions). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await wellbeingOverview(), "Ringkasan dimuat.");
  });
}

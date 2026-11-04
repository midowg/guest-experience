import { handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { questionnaireWaiting } from "@/lib/server/pra-wam/questionnaire";
import { questionnaireProgress } from "@/lib/server/pra-wam/questionnaire-admin";

export const dynamic = "force-dynamic";

/** GET: who started and finished the questionnaire, by department; no answers themselves (any admin). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    const report = await questionnaireProgress();
    if (!report) throw questionnaireWaiting();
    return success(report, "Progres dimuat.");
  });
}

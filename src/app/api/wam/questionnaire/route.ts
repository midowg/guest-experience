import { seesQuestionnaire } from "@/lib/pra-wam/questionnaire";
import { ServiceError } from "@/lib/server/config";
import { handle, success } from "@/lib/server/http";
import { currentForm } from "@/lib/server/pra-wam/questionnaire";
import { myAnswers } from "@/lib/server/pra-wam/questionnaire-answers";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** GET: my named answers, consent, progress and whether my anonymous section is in. */
export async function GET() {
  return handle(async () => {
    const member = await requireApiMember();
    const form = await currentForm();
    if (!form || !seesQuestionnaire(form, member.id, false)) throw new ServiceError(404, "Kuesioner belum dibuka.");
    return success(await myAnswers(form, member.id), "Jawaban dimuat.");
  });
}

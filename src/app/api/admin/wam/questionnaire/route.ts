import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { adminQuestionnaire, formSettingsSchema, saveFormSettings } from "@/lib/server/pra-wam/questionnaire-admin";
import { questionnaireWaiting } from "@/lib/server/pra-wam/questionnaire";

export const dynamic = "force-dynamic";

/** GET: the questionnaire's settings, sections and questions, hidden ones included (any admin). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    const content = await adminQuestionnaire();
    if (!content) throw questionnaireWaiting();
    return success(content, "Kuesioner dimuat.");
  });
}

/** PATCH: the form's name, address, status, texts and dates (any admin). A new address keeps the old one redirecting. */
export async function PATCH(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { result, message } = await saveFormSettings(validate(formSettingsSchema, await readJson(request, 10_000)));
    return success(result, message);
  });
}

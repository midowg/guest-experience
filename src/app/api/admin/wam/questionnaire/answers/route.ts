import { answerDeleteSchema, deletedText } from "@/lib/pra-wam/answer-delete";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { deleteAnswers } from "@/lib/server/pra-wam/answer-delete";
import { currentForm, questionnaireWaiting } from "@/lib/server/pra-wam/questionnaire";

export const dynamic = "force-dynamic";

/**
 * DELETE {who: "pilih", employeeIds} or {who: "semua", confirm: "HAPUS"}: Rekap's "Hapus jawaban"
 * (12 Nov 2026, any admin). Deleted for good; the rules are in src/lib/server/pra-wam/answer-delete.ts.
 */
export async function DELETE(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(answerDeleteSchema, await readJson(request, 100_000));
    const form = await currentForm();
    if (!form) throw questionnaireWaiting();
    const result = await deleteAnswers(form, input);
    return success(result, deletedText(input, result));
  });
}

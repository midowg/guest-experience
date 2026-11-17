import { silentFeedbackSchema } from "@/lib/main-wam/modul/silent";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { limitPerson } from "@/lib/server/main-wam/modul/rate";
import { sendSilentFeedback } from "@/lib/server/main-wam/modul/silent";

export const dynamic = "force-dynamic";

/**
 * POST {questionId, topic, body}: one anonymous feedback (T01 → T02). Peserta and panitia (not BOD),
 * module Silent Meeting on. The text is never logged with the sender.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const { viewer } = await requireActionApi("silent-kirim");
    checkOrigin(request);
    const input = validate(silentFeedbackSchema, await readJson(request, 8_000));
    await limitPerson("silent", viewer.id, 20);
    return success(await sendSilentFeedback(input, viewer, new Date()), "Masukan terkirim.");
  });
}

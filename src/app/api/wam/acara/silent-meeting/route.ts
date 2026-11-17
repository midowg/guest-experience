import { z } from "zod";
import { mainWamCan } from "@/lib/main-wam/access";
import { silentOpenSchema } from "@/lib/main-wam/modul/silent";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi, requireModuleApi } from "@/lib/server/main-wam/gate";
import { recordOpener, sendsLeft, silentNow } from "@/lib/server/main-wam/modul/silent";

export const dynamic = "force-dynamic";
const query = z.object({ sesi: z.uuid("Sesi tidak dikenali.").optional() });

/** GET ?sesi=: the Silent Meeting open now (or of a session) with its state (never a count), and whether this person may send. */
export async function GET(request: Request) {
  return handle(async () => {
    const { viewer } = await requireModuleApi("silent");
    const { sesi } = validate(query, Object.fromEntries(new URL(request.url).searchParams));
    const { view, migrated } = await silentNow(new Date(), sesi);
    const sends = !!view && mainWamCan(viewer, "silent-kirim");
    return success({ view, migrated, canSend: sends, remaining: sends && view ? sendsLeft(view.question.id, viewer) : 0 }, "");
  });
}

/**
 * POST {questionId}: T01 was opened while the Silent Meeting is open (once per person per question,
 * under an HMAC of the person). A request of its own, never with a feedback (audit H1). Answers nothing.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const { viewer } = await requireActionApi("silent-kirim");
    checkOrigin(request);
    const { questionId } = validate(silentOpenSchema, await readJson(request, 1_000));
    await recordOpener(questionId, viewer, new Date());
    return success(null, "");
  });
}

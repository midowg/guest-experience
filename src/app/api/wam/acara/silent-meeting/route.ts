import { z } from "zod";
import { mainWamCan } from "@/lib/main-wam/access";
import { SILENT_MAX_SENDS } from "@/lib/main-wam/modul/silent";
import { handle, success, validate } from "@/lib/server/http";
import { requireModuleApi } from "@/lib/server/main-wam/gate";
import { mySentCount, silentNow } from "@/lib/server/main-wam/modul/silent";

export const dynamic = "force-dynamic";
const query = z.object({ sesi: z.uuid("Sesi tidak dikenali.").optional() });

/** GET ?sesi=: the Silent Meeting open now (or of a session) with its state, and how many more this person may send. */
export async function GET(request: Request) {
  return handle(async () => {
    const { viewer } = await requireModuleApi("silent");
    const { sesi } = validate(query, Object.fromEntries(new URL(request.url).searchParams));
    const now = new Date();
    const { view, migrated } = await silentNow(now, sesi);
    const sends = view && mainWamCan(viewer, "silent-kirim");
    const sent = sends ? await mySentCount(view.question.id, viewer.id) : 0;
    return success({ view, migrated, canSend: !!sends, remaining: sends ? Math.max(0, SILENT_MAX_SENDS - sent) : 0 }, "");
  });
}

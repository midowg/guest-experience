import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { remindNotDone } from "@/lib/server/pra-wam/reminders";

export const dynamic = "force-dynamic";
const schema = z.object({ who: z.enum(["semua", "belum", "sedang"]) });

/** POST {who}: "Ingatkan yang belum", a WAM notification to those not done (all, not started, or halfway). Any admin. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { who } = validate(schema, await readJson(request, 200));
    const sent = await remindNotDone(who);
    return success({ sent }, `Pengingat terkirim ke ${sent} orang lewat notifikasi WAM.`);
  });
}

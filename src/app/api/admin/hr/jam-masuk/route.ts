import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { setLateAfter } from "@/lib/server/hr/leave";
import { hrAdminActor } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";

/** PUT {time}: a masuk after this time ("HH:MM", in the office's zone) counts as Telat. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { time } = validate(z.object({ time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Jam tidak dikenali.") }), await readJson(request, 200));
    await setLateAfter(time, await hrAdminActor());
    return success({ time }, `Masuk setelah ${time.replace(":", ".")} sekarang terhitung Telat.`);
  });
}

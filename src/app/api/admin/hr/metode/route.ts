import { z } from "zod";
import { CLOCK_METHODS, clockMethodLabels } from "@/lib/hr/attendance";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { setClockMethod } from "@/lib/server/hr/attendance";
import { hrAdminActor } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";

/** PUT {method}: how everyone clocks in from now on (Wajah + gerakan or Foto cepat). */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { method } = validate(z.object({ method: z.enum(CLOCK_METHODS) }), await readJson(request, 200));
    await setClockMethod(method, await hrAdminActor());
    return success({ method }, `Metode absen sekarang: ${clockMethodLabels[method]}.`);
  });
}

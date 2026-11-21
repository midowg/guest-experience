import { kindLabels, manualSchema } from "@/lib/hr/attendance";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { recordManual } from "@/lib/server/hr/attendance";
import { hrAdminActor } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";

/** POST: a clock-in recorded by hand, with the reason (no face consent, a broken phone, a forgotten clock-in). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(manualSchema, await readJson(request, 1_000));
    return success(await recordManual(input, await hrAdminActor()), `Absen ${kindLabels[input.kind].toLowerCase()} dicatat.`);
  });
}

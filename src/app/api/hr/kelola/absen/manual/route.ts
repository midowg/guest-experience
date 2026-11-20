import { kindLabels, manualSchema } from "@/lib/hr/attendance";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { recordManual } from "@/lib/server/hr/attendance";
import { actorOf, requireApiHrAdmin } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";

/** POST: a clock-in recorded by hand, with the reason (no face consent, a broken phone, a forgotten clock-in). */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiHrAdmin();
    checkOrigin(request);
    const input = validate(manualSchema, await readJson(request, 1_000));
    return success(await recordManual(input, actorOf(member)), `Absen ${kindLabels[input.kind].toLowerCase()} dicatat.`);
  });
}

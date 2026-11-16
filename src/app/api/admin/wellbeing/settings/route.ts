import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { saveWellbeingSettings, wellbeingActor, wellbeingSettings } from "@/lib/server/wellbeing/admin";
import { settingsSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";

/** GET: the programme's rules (how far back, kcal and steps caps). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await wellbeingSettings(), "Aturan dimuat.");
  });
}

/** PUT: change the rules; activities already logged keep their points. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(settingsSchema, await readJson(request, 1_000));
    return success(await saveWellbeingSettings(input, await wellbeingActor()), "Aturan disimpan.");
  });
}

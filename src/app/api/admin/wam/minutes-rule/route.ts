import { minutesRuleSchema } from "@/lib/pra-wam/minutes";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { saveMinutesRule } from "@/lib/server/pra-wam/minutes-rule";

export const dynamic = "force-dynamic";

/** PUT: which meetings need a MoM, per session kind and for one-on-ones (any admin, 12 Nov 2026). */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    return success(await saveMinutesRule(validate(minutesRuleSchema, await readJson(request, 1_000))), "Aturan MoM disimpan.");
  });
}

import { tvSettingsSchema } from "@/lib/pra-wam/tv";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { saveSettings, tvAdmin } from "@/lib/server/pra-wam/tv";

export const dynamic = "force-dynamic";

/** PUT {showSchedule, scheduleSeconds}: whether TVs show today's rooms, and for how long per page (any admin). */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await saveSettings(validate(tvSettingsSchema, await readJson(request, 2_000)));
    return success(await tvAdmin(), "Pengaturan tersimpan. TV mengikuti dalam setengah menit.");
  });
}

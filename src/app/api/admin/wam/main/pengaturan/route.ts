import { settingsInputSchema } from "@/lib/main-wam/settings";
import { mainWamModeLabels } from "@/lib/main-wam/types";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { saveMainWamSettings } from "@/lib/server/main-wam/settings";

export const dynamic = "force-dynamic";

/** PUT {mode?, modules?, moduleConfig?, theme?}: Admin WAM → Main WAM → Pengaturan (any Admin WAM admin). */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(settingsInputSchema, await readJson(request, 10_000));
    const settings = await saveMainWamSettings(input);
    const demo = input.moduleConfig?.demo;
    return success(settings, input.mode ? `Mode acara: ${mainWamModeLabels[settings.mode]}.` : demo === undefined ? "Pengaturan Main WAM tersimpan." : demo ? "Mode demo menyala. Matikan sebelum acara." : "Mode demo mati.");
  });
}

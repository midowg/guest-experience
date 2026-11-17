import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { saveAppControls, wellbeingActor } from "@/lib/server/wellbeing/admin";
import { appControlsSchema } from "@/lib/wellbeing/rules";

export const dynamic = "force-dynamic";

/** PUT: Pengaturan → Aplikasi karyawan (announcement, prize, photo reading, pause Catat); shows in the app on its next refresh. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(appControlsSchema, await readJson(request, 4_000));
    return success(await saveAppControls(input, await wellbeingActor()), "Pengaturan aplikasi karyawan disimpan.");
  });
}

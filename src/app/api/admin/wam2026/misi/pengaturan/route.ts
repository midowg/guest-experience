import { settingsSchema } from "@/lib/main-wam/misi/schema";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { saveMissionSettings } from "@/lib/server/main-wam/misi/admin";

export const dynamic = "force-dynamic";

/** PUT {defaultRadiusM, maxAccuracyM, leaderboardOpen}: the radius a mission without its own uses, the worst location accuracy accepted, and whether the Peringkat is open. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(settingsSchema, await readJson(request, 1_000));
    return success(await saveMissionSettings(input), "Pengaturan misi tersimpan.");
  });
}

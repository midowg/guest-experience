import { missionSheetSchema } from "@/lib/pra-wam/mission-sheet";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { missionAdminState, saveMissionSheet } from "@/lib/server/pra-wam/mission-admin";

export const dynamic = "force-dynamic";

/** PUT {rooms, people, bod}: Misi Perjalanan's room list (any admin); the old list is kept as a backup first. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await saveMissionSheet(validate(missionSheetSchema, await readJson(request, 200_000)));
    return success(await missionAdminState(), "Misi Perjalanan disimpan.");
  });
}

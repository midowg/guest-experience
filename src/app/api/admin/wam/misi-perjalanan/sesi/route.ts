import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { missionSessionsSchema, missionSessionsState, saveMissionSessions } from "@/lib/server/pra-wam/mission-sessions";

export const dynamic = "force-dynamic";

/** PUT {ids}: the sessions that open Misi Perjalanan (any admin); none: it opens nowhere. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { ids } = validate(missionSessionsSchema, await readJson(request, 4_000));
    await saveMissionSessions(ids);
    return success(await missionSessionsState(), "Sesi Misi Perjalanan disimpan.");
  });
}

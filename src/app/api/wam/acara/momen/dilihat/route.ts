import { photosSeenSchema } from "@/lib/main-wam/momen/filters";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { markSeen } from "@/lib/server/main-wam/momen/feed";

export const dynamic = "force-dynamic";

/** POST {ids}: photos the person has seen in the stack (at most 100 at a time). */
export async function POST(request: Request) {
  return handle(async () => {
    const { viewer } = await requireMainWamApi();
    checkOrigin(request);
    const { ids } = validate(photosSeenSchema, await readJson(request, 6_000));
    return success({ seen: await markSeen(viewer, ids) }, "Dicatat.");
  });
}

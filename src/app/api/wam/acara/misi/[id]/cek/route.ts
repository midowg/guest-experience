import { z } from "zod";
import { positionSchema } from "@/lib/main-wam/misi/schema";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireActionApi } from "@/lib/server/main-wam/gate";
import { checkPosition } from "@/lib/server/main-wam/misi/actions";
import { MISSION_KINDS } from "@/lib/main-wam/misi/types";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

const body = z.object({ kind: z.enum(MISSION_KINDS), position: positionSchema }).strict();

/** POST {kind, position}: is this position inside the mission's area? The answer only; nothing is saved. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireActionApi("misi");
    checkOrigin(request);
    const id = validate(z.uuid("Misi tidak dikenali."), (await params).id);
    const input = validate(body, await readJson(request, 2_000));
    return success(await checkPosition(context, id, input.kind, input.position), "");
  });
}

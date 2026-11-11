import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { setActionDone } from "@/lib/server/pra-wam/minutes";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; actionId: string }> };

/** PATCH {done}: ticks a follow-up done or not (anyone in the meeting, or its PIC). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const { id, actionId } = await params;
    const { done } = validate(z.object({ done: z.boolean() }), await readJson(request, 1_000));
    const action = await setActionDone(validate(z.uuid(), id), validate(z.uuid(), actionId), done, member);
    return success(action, done ? "Tindak lanjut ditandai selesai." : "Tindak lanjut dibuka lagi.");
  });
}

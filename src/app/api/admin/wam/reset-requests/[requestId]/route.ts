import { z } from "zod";
import { resetActionSchema } from "@/lib/pra-wam/reset-requests";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { handleResetRequest, listResetRequests } from "@/lib/server/pra-wam/reset-requests";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ requestId: string }> };

/** PATCH {action}: "reset" to the shared first password, or "tolak" (any admin). Answers with the fresh list. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const role = await requireApiAdmin();
    checkOrigin(request);
    const requestId = validate(z.uuid(), (await params).requestId);
    const { action } = validate(resetActionSchema, await readJson(request, 1_000));
    const message = await handleResetRequest(requestId, action, role === "super" ? "super admin" : "admin");
    return success(await listResetRequests(), message);
  });
}

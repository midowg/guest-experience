import { z } from "zod";
import { manageInvitation } from "@/lib/server/invitations";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; invitationId: string }> };
const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name: z.string().trim().min(1).max(150) }),
  z.object({ action: z.literal("revoke") }),
  z.object({ action: z.literal("rotate") }),
]);

export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id, invitationId } = await params;
    validate(z.uuid(), id); validate(z.uuid(), invitationId);
    const input = validate(updateSchema, await readJson(request, 2000));
    return success(await manageInvitation(id, input.action, invitationId, input.action === "rename" ? input.name : undefined), "Undangan diperbarui.");
  });
}

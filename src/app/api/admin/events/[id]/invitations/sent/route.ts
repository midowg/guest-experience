import { z } from "zod";
import { markInvitationsSent } from "@/lib/server/invitations";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const schema = z.object({ ids: z.array(z.uuid()).min(1).max(1000) });

/** Called when the admin opens WhatsApp for guests: records the attempt, not the delivery. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    await requireEventAccess(id);
    const { ids } = validate(schema, await readJson(request, 60_000));
    return success(await markInvitationsSent(id, ids), "Status kirim dicatat.");
  });
}

import { z } from "zod";
import { setEventHidden } from "@/lib/server/event-visibility";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const schema = z.object({ hidden: z.boolean() });

/** Super admin only: hide an event from regular admins, or show it again. Guests are unaffected. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const { hidden } = validate(schema, await readJson(request, 1000));
    const saved = await setEventHidden(id, hidden);
    return success({ hidden: saved }, saved ? "Acara disembunyikan dari admin biasa." : "Acara kembali terlihat oleh admin biasa.");
  });
}

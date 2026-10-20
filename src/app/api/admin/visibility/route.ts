import { z } from "zod";
import { setEventHidden } from "@/lib/server/event-visibility";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireSuperAdmin } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const schema = z.object({ ids: z.array(z.uuid()).min(1).max(200), hidden: z.boolean() });

/** Super admin dashboard: hide or show several events for regular admins at once. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireSuperAdmin();
    checkOrigin(request);
    const { ids, hidden } = validate(schema, await readJson(request, 20_000));
    // One by one, so each change is audited the same way as a single toggle.
    for (const id of [...new Set(ids)]) await setEventHidden(id, hidden);
    return success({ ids, hidden }, hidden ? `${ids.length} acara disembunyikan dari admin biasa.` : `${ids.length} acara kembali terlihat oleh admin biasa.`);
  });
}

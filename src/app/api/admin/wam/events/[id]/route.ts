import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { listEvents, updateEvent } from "@/lib/server/pra-wam/events";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const schema = z.object({ status: z.enum(["aktif", "disiapkan", "selesai"]), modules: z.record(z.enum(["appraisal"]), z.boolean()) });

/** PATCH: an event's status and which modules are open (any admin). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await updateEvent(validate(z.uuid(), (await params).id), validate(schema, await readJson(request, 2_000)));
    return success(await listEvents(), "Acara disimpan.");
  });
}

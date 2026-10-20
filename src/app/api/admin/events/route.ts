import { z } from "zod";
import { setupSchema } from "@/lib/event-setup";
import { createEvent, listAdminEvents } from "@/lib/server/events";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";
import { hiddenEventIds } from "@/lib/server/event-visibility";

export const dynamic = "force-dynamic";
const schema = z.object({ duplicateId: z.uuid().optional(), setup: setupSchema.optional() });

export async function GET() {
  return handle(async () => {
    const role = await requireApiAdmin();
    const events = await listAdminEvents();
    const { ids } = role === "super" ? { ids: new Set<string>() } : await hiddenEventIds();
    return success(events.filter(event => !ids.has(event.id)), "Daftar acara dimuat.");
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { duplicateId, setup } = validate(schema, await readJson(request, 30_000));
    if (duplicateId) await requireEventAccess(duplicateId);
    return success(await createEvent(duplicateId, setup), "Draft acara dibuat.");
  });
}

import { z } from "zod";
import { setupSchema } from "@/lib/event-setup";
import { createEvent, listAdminEvents } from "@/lib/server/events";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";
import { hiddenEventIds } from "@/lib/server/event-visibility";
import { disabledModulesFor, templatesFor } from "@/lib/server/admin-settings";
import { ServiceError } from "@/lib/server/config";

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
    const role = await requireApiAdmin();
    checkOrigin(request);
    const { duplicateId, setup } = validate(schema, await readJson(request, 30_000));
    if (duplicateId) await requireEventAccess(duplicateId);
    // Copies keep their own content; new events must start from a template this admin may use.
    if (setup && !duplicateId) {
      if (setup.template === "blank" ? role !== "super" : !(await templatesFor(role)).includes(setup.template)) {
        throw new ServiceError(403, "Templat ini tidak tersedia. Pilih templat lain di Buat acara.");
      }
    }
    return success(await createEvent(duplicateId, setup, await disabledModulesFor(role)), "Draft acara dibuat.");
  });
}

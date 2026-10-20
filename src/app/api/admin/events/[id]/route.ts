import { z } from "zod";
import { deleteEvent, readAdminEvent, saveEvent } from "@/lib/server/events";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
const idSchema = z.uuid();
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    const id = validate(idSchema, (await params).id);
    await requireEventAccess(id);
    const event = await readAdminEvent(id);
    if (!event) throw new ServiceError(404, "Acara tidak ditemukan.");
    return success(event, "Acara dimuat.");
  });
}

export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(idSchema, (await params).id);
    await requireEventAccess(id);
    return success(await saveEvent(id, await readJson(request), false), "Perubahan tersimpan.");
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(idSchema, (await params).id);
    await requireEventAccess(id);
    const removed = await deleteEvent(id);
    const answers = removed.rsvps + removed.feedback;
    return success(removed, answers > 0
      ? `Acara dihapus beserta ${removed.rsvps} konfirmasi dan ${removed.feedback} masukan tamu.`
      : "Acara dihapus.");
  });
}

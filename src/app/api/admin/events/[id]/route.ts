import { z } from "zod";
import { deleteEvent, readAdminEvent, saveEvent } from "@/lib/server/events";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const idSchema = z.uuid();
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const id = validate(idSchema, (await params).id);
    const event = await readAdminEvent(id);
    if (!event) throw new ServiceError(404, "Acara tidak ditemukan.");
    return success(event, "Acara dimuat.");
  });
}

export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    checkOrigin(request);
    const id = validate(idSchema, (await params).id);
    return success(await saveEvent(id, await readJson(request), false), "Perubahan tersimpan.");
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    checkOrigin(request);
    const id = validate(idSchema, (await params).id);
    const removed = await deleteEvent(id);
    const answers = removed.rsvps + removed.feedback;
    return success(removed, answers > 0
      ? `Acara dihapus beserta ${removed.rsvps} konfirmasi dan ${removed.feedback} masukan tamu.`
      : "Acara dihapus.");
  });
}

import { z } from "zod";
import { deleteEvent, readAdminEvent, saveEvent } from "@/lib/server/events";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";
import { disabledModulesFor, moduleNames } from "@/lib/server/admin-settings";
import { blockedChanges } from "@/lib/admin-modules";
import { eventSchema } from "@/lib/validation";

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
    const role = await requireEventAccess(id);
    const input = await readJson(request);
    const disabled = await disabledModulesFor(role);
    if (disabled.length && input && typeof input === "object" && !Array.isArray(input)) {
      const parsed = eventSchema.safeParse({ ...input, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      // An invalid document is rejected by saveEvent with field errors; only a valid one is checked here.
      if (parsed.success) {
        const blocked = blockedChanges(await readAdminEvent(id), parsed.data, disabled);
        if (blocked.length) throw new ServiceError(403, `Modul berikut dinonaktifkan oleh super admin dan tidak bisa dinyalakan: ${moduleNames(blocked)}.`);
      }
    }
    try {
      return success(await saveEvent(id, input, false), "Perubahan tersimpan.");
    } catch (error) {
      // Before 202610220003 the database still asks a published card for an organiser and a place.
      const document = input as { event_kind?: string; status?: string } | null;
      if (error instanceof ServiceError && error.message === "Konten acara tidak valid." && document?.event_kind === "kartu" && document.status === "published") {
        throw new ServiceError(422, "Kartu belum bisa dipublikasikan: database menunggu migrasi 202610220003_card_publish.sql. Simpan sebagai draf dulu.");
      }
      // Before 202610260001 the same holds for an E-Guide.
      if (error instanceof ServiceError && error.message === "Konten acara tidak valid." && document?.event_kind === "eguide" && document.status === "published") {
        throw new ServiceError(422, "E-Guide belum bisa dipublikasikan sebelum migrasi 202610260001 diterapkan. Simpan sebagai draf dulu.");
      }
      throw error;
    }
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

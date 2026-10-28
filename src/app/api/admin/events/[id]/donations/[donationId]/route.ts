import { z } from "zod";
import { donationActionSchema } from "@/lib/validation";
import { deleteDonation, updateDonation } from "@/lib/server/donations";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { getAdminEvent } from "@/lib/server/events";
import { ServiceError } from "@/lib/server/config";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; donationId: string }> };
const messages = { receive: "Donasi ditandai diterima.", reject: "Donasi ditolak.", pending: "Donasi dikembalikan ke menunggu.", notified: "Kabar penyerahan ditandai terkirim.", assign: "Pembagian disimpan." } as const;

/** PATCH: receive (with the amount that came in), reject (with a reason), back to waiting, handover news sent, or share out to a recipient. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id, donationId } = await params;
    const eventId = validate(z.uuid(), id);
    await requireEventAccess(eventId);
    const change = validate(donationActionSchema, await readJson(request, 5_000));
    // Only to a recipient this event lists (or back to none).
    if (change.action === "assign" && change.recipient_id && !(await getAdminEvent(eventId))?.donation.recipients.some(item => item.id === change.recipient_id)) throw new ServiceError(422, "Penerima tidak ditemukan. Muat ulang halaman.");
    return success(await updateDonation(eventId, validate(z.uuid(), donationId), change), messages[change.action]);
  });
}

export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id, donationId } = await params;
    const eventId = validate(z.uuid(), id);
    await requireEventAccess(eventId);
    await deleteDonation(eventId, validate(z.uuid(), donationId));
    return success(null, "Donasi dihapus.");
  });
}

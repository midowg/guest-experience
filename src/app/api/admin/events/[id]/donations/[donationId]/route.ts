import { z } from "zod";
import { donationActionSchema } from "@/lib/validation";
import { deleteDonation, updateDonation } from "@/lib/server/donations";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin, requireEventAccess } from "@/lib/server/admin-session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; donationId: string }> };
const messages = { receive: "Donasi ditandai diterima.", reject: "Donasi ditolak.", pending: "Donasi dikembalikan ke menunggu.", notified: "Kabar penyerahan ditandai terkirim." } as const;

/** PATCH: receive (with the amount that came in), reject (with a reason), back to waiting, or handover news sent. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id, donationId } = await params;
    const eventId = validate(z.uuid(), id);
    await requireEventAccess(eventId);
    const change = validate(donationActionSchema, await readJson(request, 5_000));
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

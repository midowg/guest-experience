import { z } from "zod";
import { officeBookingSchema } from "@/lib/booking/rules";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { cancelOfficeBooking, saveOfficeBooking } from "@/lib/server/booking/bookings";
import { handleBooking } from "@/lib/server/pra-wam/respond";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PATCH: change an office booking: the booker their own, the administration staff anyone's (it stays the booker's). */
export async function PATCH(request: Request, { params }: Params) {
  return handleBooking(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const body = await readJson(request, 20_000);
    const input = validate(officeBookingSchema, body);
    const flags = validate(z.object({ confirmed: z.boolean().default(false), overCapacity: z.boolean().default(false) }), body);
    return success(await saveOfficeBooking(input, member, { id, ...flags }), "Booking diperbarui.");
  });
}

/** DELETE {reason?}: cancel a booking (the booker, or the administration staff with a reason); the room is free at once. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    // The app always sends {reason}: empty from the booker, filled by the administration staff.
    const { reason } = validate(z.object({ reason: z.string().trim().max(300, "Alasan paling panjang 300 karakter.").default("") }), await readJson(request, 2_000));
    await cancelOfficeBooking(id, member, reason);
    return success(null, "Booking dibatalkan. Ruangan kembali tersedia.");
  });
}

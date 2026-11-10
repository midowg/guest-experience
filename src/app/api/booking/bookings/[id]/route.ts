import { z } from "zod";
import { officeBookingSchema } from "@/lib/booking/rules";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { cancelOfficeBooking, saveOfficeBooking } from "@/lib/server/booking/bookings";
import { handleBooking } from "@/lib/server/pra-wam/respond";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PATCH: change one of the person's own office bookings. */
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

/** DELETE: cancel a booking (the booker, or the administration staff); the room is free at once. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await cancelOfficeBooking(validate(z.uuid(), (await params).id), member);
    return success(null, "Booking dibatalkan. Ruangan kembali tersedia.");
  });
}

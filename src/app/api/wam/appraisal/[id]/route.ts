import { z } from "zod";
import { bookingInputSchema } from "@/lib/pra-wam/appraisal";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { cancelBooking, saveBooking } from "@/lib/server/pra-wam/appraisal";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { handleBooking } from "@/lib/server/pra-wam/respond";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PATCH: change one of the person's own bookings. */
export async function PATCH(request: Request, { params }: Params) {
  return handleBooking(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const body = await readJson(request, 20_000);
    const input = validate(bookingInputSchema, body);
    const confirmed = validate(z.object({ confirmed: z.boolean().default(false) }), body).confirmed;
    return success(await saveBooking(input, member, { id, confirmed }), "Booking diperbarui.");
  });
}

/** DELETE: cancel one of the person's own bookings; the slot is free at once. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await cancelBooking(validate(z.uuid(), (await params).id), member);
    return success(null, "Booking dibatalkan. Ruang kembali tersedia.");
  });
}

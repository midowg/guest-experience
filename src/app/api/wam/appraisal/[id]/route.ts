import { z } from "zod";
import { bookingInputSchema } from "@/lib/pra-wam/appraisal";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { cancelBooking, deleteBooking, saveBooking } from "@/lib/server/pra-wam/appraisal";
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

/** DELETE: cancel a booking (the slot is free at once); with ?permanent=1, remove it for good. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    if (new URL(request.url).searchParams.get("permanent") === "1") {
      await deleteBooking(id, member);
      return success(null, "Booking dihapus.");
    }
    await cancelBooking(id, member);
    return success(null, "Booking dibatalkan. Ruang kembali tersedia.");
  });
}

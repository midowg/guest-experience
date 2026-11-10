import { z } from "zod";
import { officeBookingSchema } from "@/lib/booking/rules";
import { checkOrigin, readJson, success, validate } from "@/lib/server/http";
import { saveOfficeBooking } from "@/lib/server/booking/bookings";
import { handleBooking } from "@/lib/server/pra-wam/respond";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: book a room from Booking Kantor. `confirmed` saves even when someone invited is booked elsewhere then. */
export async function POST(request: Request) {
  return handleBooking(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const body = await readJson(request, 20_000);
    const input = validate(officeBookingSchema, body);
    const flags = validate(z.object({ confirmed: z.boolean().default(false), overCapacity: z.boolean().default(false) }), body);
    return success(await saveOfficeBooking(input, member, flags), "Ruangan berhasil dipesan.");
  });
}

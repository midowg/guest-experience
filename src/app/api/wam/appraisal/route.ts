import { z } from "zod";
import { bookingInputSchema, bookingSavedText } from "@/lib/pra-wam/appraisal";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { daySchedule, saveBooking } from "@/lib/server/pra-wam/appraisal";
import { hodUnitsSchema } from "@/lib/pra-wam/hod";
import { hodInvitees, linkHodBooking } from "@/lib/server/pra-wam/hod";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { handleBooking } from "@/lib/server/pra-wam/respond";

export const dynamic = "force-dynamic";

/** GET ?date=YYYY-MM-DD: every room and booking that day. */
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    const date = validate(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid."), new URL(request.url).searchParams.get("date"));
    return success(await daySchedule(date, member), "Jadwal ruang dimuat.");
  });
}

/** POST: book a room. `confirmed` saves even when a participant is booked elsewhere then. */
export async function POST(request: Request) {
  return handleBooking(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const body = await readJson(request, 20_000);
    const input = validate(bookingInputSchema, body);
    const confirmed = validate(z.object({ confirmed: z.boolean().default(false) }), body).confirmed;
    // Booking as HOD (6 Nov 2026): the participants are the HODs of the departments picked.
    const { hodUnits } = validate(hodUnitsSchema, body);
    const invites = hodUnits.length ? await hodInvitees(member, hodUnits) : [];
    if (invites.length) input.participants = invites.map(invite => invite.employee_id);
    const saved = await saveBooking(input, member, { confirmed, quiet: invites.length > 0 });
    if (invites.length) await linkHodBooking(member, saved, invites);
    return success(saved, invites.length ? `${bookingSavedText(input)} Undangan terkirim ke ${invites.length} HOD.` : bookingSavedText(input));
  });
}

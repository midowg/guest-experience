import { z } from "zod";
import { bookingInputSchema, bookingSavedText, isRecordDate } from "@/lib/pra-wam/appraisal";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { daySchedule, saveBooking, weekSchedule } from "@/lib/server/pra-wam/appraisal";
import { hodUnitsSchema } from "@/lib/pra-wam/hod";
import { hodInvitees, linkHodBooking } from "@/lib/server/pra-wam/hod";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { handleBooking } from "@/lib/server/pra-wam/respond";

export const dynamic = "force-dynamic";

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.");
const MONTH_DAYS = 42;

/**
 * GET ?date=YYYY-MM-DD: every room and booking that day. GET ?from=&to= (Book's month view, 8 Nov
 * 2026): every booking from one day to another, at most six weeks.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    const search = new URL(request.url).searchParams;
    if (search.has("from")) {
      const { from, to } = validate(z.object({ from: DAY, to: DAY }).refine(range => range.from <= range.to, "Rentang tanggal terbalik.")
        .refine(range => (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000 < MONTH_DAYS, "Rentang paling lama enam minggu."),
      { from: search.get("from"), to: search.get("to") });
      return success(await weekSchedule([from, to], member), "Jadwal ruang dimuat.");
    }
    const date = validate(DAY, search.get("date"));
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
    const { confirmed, overCapacity } = validate(z.object({ confirmed: z.boolean().default(false), overCapacity: z.boolean().default(false) }), body);
    // Booking as HOD (6 Nov 2026): the participants are the HODs of the departments picked.
    const { hodUnits } = validate(hodUnitsSchema, body);
    // A record of a day gone (10 Nov 2026) invites no one, so HOD/Lead and ITEM have nothing to ask.
    if (hodUnits.length && isRecordDate(input.date, new Date())) throw new ServiceError(422, "Meeting HOD/Lead atau ITEM tidak bisa dicatat untuk tanggal yang sudah lewat. Pilih Pribadi.", { participants: ["Pilih Pribadi untuk tanggal yang sudah lewat."] });
    const invites = hodUnits.length ? await hodInvitees(member, hodUnits) : [];
    if (invites.length) input.participants = invites.map(invite => invite.employee_id);
    const saved = await saveBooking(input, member, { confirmed, overCapacity, quiet: invites.length > 0 });
    if (invites.length) await linkHodBooking(member, saved, invites);
    return success(saved, invites.length ? `${bookingSavedText(input)} Undangan terkirim ke ${invites.length} HOD.` : bookingSavedText(input));
  });
}

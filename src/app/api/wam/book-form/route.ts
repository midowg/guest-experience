import { handle, success } from "@/lib/server/http";
import { ServiceError } from "@/lib/server/config";
import { bookingFormData } from "@/lib/server/pra-wam/booking-form";
import { booksRooms, NO_BOOKING_TEXT } from "@/lib/pra-wam/roles";
import { appraisalOpen } from "@/lib/server/pra-wam/events";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/**
 * GET ?date=YYYY-MM-DD[&room=<id>] (or ?edit=<booking id>): what the booking form needs, for the booking sheet
 * that opens over Timeline and Agenda (9 Nov 2026) without leaving the page.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    if (!booksRooms(member)) throw new ServiceError(403, NO_BOOKING_TEXT);
    if (!await appraisalOpen()) throw new ServiceError(409, "Book ruang sedang ditutup oleh admin WAM.");
    const search = new URL(request.url).searchParams;
    const pick = (key: string) => search.get(key) ?? undefined;
    // A room asked for (11 Nov 2026: "Book" on a room card of Timeline) starts picked when it suits.
    const room = pick("room");
    return success(await bookingFormData(member, { date: pick("date"), edit: pick("edit"), room: room && /^[0-9a-f-]{36}$/.test(room) ? room : undefined }), "Form booking dimuat.");
  });
}

import { eventInfoSchema } from "@/lib/main-wam/admin/event-info";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { saveEventInfo } from "@/lib/server/main-wam/admin/event-info";

export const dynamic = "force-dynamic";

/**
 * PUT any of {name, venue, hotel, address, checkIn, checkOut, contacts, groupsPublished, carbon}:
 * Admin WAM 2027 → Info acara (and Terbitkan on Kelompok). Answers with the settings.
 */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(eventInfoSchema, await readJson(request, 10_000));
    const settings = await saveEventInfo(input);
    const message = input.groupsPublished === true ? "Kelompok diterbitkan. Peserta sekarang melihat kelompoknya."
      : input.groupsPublished === false ? "Kelompok disembunyikan dari peserta." : "Info acara tersimpan.";
    return success(settings, message);
  });
}

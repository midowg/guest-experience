import { hodMeetingSchema } from "@/lib/pra-wam/hod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { createHodMeeting } from "@/lib/server/pra-wam/hod";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: a HOD asks the HODs of the picked departments to a meeting. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const id = await createHodMeeting(member, validate(hodMeetingSchema, await readJson(request, 8_000)));
    return success({ id }, "Undangan terkirim. Meeting terjadwal setelah semua HOD menerima.");
  });
}

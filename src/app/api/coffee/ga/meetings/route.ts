import { meetingSchema } from "@/lib/coffee/schemas";
import { submitMeeting } from "@/lib/server/coffee/meetings";
import { COFFEE_NETWORK_LIMIT, limitCoffeePerson } from "@/lib/server/coffee/rate";
import { requireApiGa } from "@/lib/server/coffee/session";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST {room, picId, guest?, guestCount?, parentId?, items, key}: one meeting order, sent by GA (Mode GA only). */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiGa();
    checkOrigin(request);
    await enforceRateLimit(request, "coffee-rapat", COFFEE_NETWORK_LIMIT);
    await limitCoffeePerson("rapat", member.id, 60);
    const input = validate(meetingSchema, await readJson(request, 20_000));
    return success(await submitMeeting(member, input), "Pesanan terkirim ke pengelola.");
  });
}

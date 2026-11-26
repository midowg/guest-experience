import { gaPinSchema } from "@/lib/coffee/schemas";
import { pinGate, tryGaPin } from "@/lib/server/coffee/pin";
import { limitCoffeePerson } from "@/lib/server/coffee/rate";
import { requireApiGa } from "@/lib/server/coffee/session";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, enforceRateLimit, handle, readJson, success } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * The outer wall per signed-in tablet account in ten minutes, right tries included. A person never
 * gets near it (wrong tries are slowed down long before, see pin.ts); it is there for a script.
 */
const PIN_CALLS = 30;
/** One sentence for every wrong try, whatever was wrong with it. */
const PIN_WRONG = "PIN tidak cocok. Coba lagi.";

/**
 * POST {pin}: is this the PIN GA? Asked by the tablet when the GA officer leaves the guest menu
 * book (Mode GA only). Nothing but yes or no comes back, and a wrong one always gets the same answer.
 *
 * Tries (audit F5-05, the rules are in pin.ts): only wrong tries are counted, five of them lock
 * the account for a short while that grows (the answer names the wait), and the pengelola saving a
 * PIN opens it again. A locked account is answered first, before the limits per address and per
 * account are touched, so a guest who keeps pressing cannot use those up for the GA officer.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiGa();
    checkOrigin(request);
    const parsed = gaPinSchema.safeParse(await readJson(request, 200));
    const gate = await pinGate(member.id);
    await enforceRateLimit(request, "coffee-pin", 60);
    await limitCoffeePerson("pin", member.id, PIN_CALLS);
    const result = await tryGaPin(member.id, parsed.success ? parsed.data.pin : "", gate);
    // No PIN yet: the tablet leaves the book with a question instead (and says the PIN is missing).
    if (!result.set) throw new ServiceError(409, "PIN GA belum diatur. Minta pengelola mengaturnya di Pengaturan.");
    if (!result.ok) throw new ServiceError(422, PIN_WRONG);
    return success({ ok: true }, "");
  });
}

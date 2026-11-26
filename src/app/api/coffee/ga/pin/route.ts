import { gaPinSchema } from "@/lib/coffee/schemas";
import { checkGaPin } from "@/lib/server/coffee/pin";
import { limitCoffeePerson } from "@/lib/server/coffee/rate";
import { requireApiGa } from "@/lib/server/coffee/session";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, enforceRateLimit, handle, readJson, success } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** How many tries one signed-in tablet account gets in ten minutes: ten thousand PINs then take a week. */
const PIN_TRIES = 10;
/** One sentence for every wrong try, whatever was wrong with it. */
const PIN_WRONG = "PIN tidak cocok. Coba lagi.";

/**
 * POST {pin}: is this the PIN GA? Asked by the tablet when the GA officer leaves the guest menu
 * book (Mode GA only). Tries are counted per signed-in person and per address before the PIN is
 * looked at, and a wrong one always gets the same answer. Nothing but yes or no comes back.
 */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiGa();
    checkOrigin(request);
    await enforceRateLimit(request, "coffee-pin", 60);
    await limitCoffeePerson("pin", member.id, PIN_TRIES);
    const parsed = gaPinSchema.safeParse(await readJson(request, 200));
    const result = await checkGaPin(parsed.success ? parsed.data.pin : "");
    // No PIN yet: the tablet leaves the book with a question instead (and says the PIN is missing).
    if (!result.set) throw new ServiceError(409, "PIN GA belum diatur. Minta pengelola mengaturnya di Pengaturan.");
    if (!result.ok) throw new ServiceError(422, PIN_WRONG);
    return success({ ok: true }, "");
  });
}

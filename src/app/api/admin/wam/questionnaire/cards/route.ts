import { characterSchema } from "@/lib/pra-wam/cards";
import { rerollResetSchema, rerollWindowSchema } from "@/lib/pra-wam/figures";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { cardsWaiting } from "@/lib/server/pra-wam/cards";
import { adminCards, createCharacter, resetReroll, saveRerollWindow } from "@/lib/server/pra-wam/cards-admin";

export const dynamic = "force-dynamic";

/** GET: the card catalog, the questions rules may use, and the cards drawn so far (any admin). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    const cards = await adminCards();
    if (!cards) throw cardsWaiting();
    return success(cards, "Kartu dimuat.");
  });
}

/**
 * PATCH (any admin): { rerollUntil } opens the one re-roll per person until a moment, or closes
 * it; { resetReroll: employeeId } gives one person their re-roll again.
 */
export async function PATCH(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const body = await readJson(request, 2_000);
    if (body && typeof body === "object" && "resetReroll" in body) {
      await resetReroll(validate(rerollResetSchema, body).resetReroll);
      return success({ cards: await adminCards() }, "Re-roll diberikan lagi. Orang ini bisa re-roll sekali lagi selama re-roll dibuka.");
    }
    const input = validate(rerollWindowSchema, body);
    await saveRerollWindow(input);
    return success({ cards: await adminCards() }, input.rerollUntil ? "Re-roll dibuka." : "Re-roll ditutup.");
  });
}

/** POST: a new character at the end of the catalog (any admin). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const created = await createCharacter(validate(characterSchema, await readJson(request, 40_000)));
    return success({ ...created, cards: await adminCards() }, "Karakter ditambahkan.");
  });
}

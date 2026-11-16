import { characterSchema } from "@/lib/pra-wam/cards";
import { rerollWindowSchema } from "@/lib/pra-wam/figures";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { cardsWaiting } from "@/lib/server/pra-wam/cards";
import { adminCards, createCharacter, saveRerollWindow } from "@/lib/server/pra-wam/cards-admin";

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

/** PATCH: open the one re-roll per person until a moment, or close it (any admin). */
export async function PATCH(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(rerollWindowSchema, await readJson(request, 2_000));
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

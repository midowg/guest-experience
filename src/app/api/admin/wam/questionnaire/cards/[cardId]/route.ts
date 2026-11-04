import { z } from "zod";
import { characterSchema } from "@/lib/pra-wam/cards";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { adminCards, removeCharacter, updateCharacter } from "@/lib/server/pra-wam/cards-admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ cardId: string }> };

/** PATCH: one character's texts, score rules, partner and visibility (any admin). */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).cardId);
    await updateCharacter(id, validate(characterSchema, await readJson(request, 40_000)));
    return success({ cards: await adminCards() }, "Karakter disimpan.");
  });
}

/** DELETE: removes a character nobody has; one someone already has is hidden instead (any admin). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { hidden } = await removeCharacter(validate(z.uuid(), (await params).cardId));
    return success({ hidden, cards: await adminCards() }, hidden ? "Karakter sudah dimiliki orang, jadi disembunyikan. Kartu mereka tetap." : "Karakter dihapus.");
  });
}

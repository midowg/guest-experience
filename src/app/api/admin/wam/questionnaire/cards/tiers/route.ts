import { tiersSchema } from "@/lib/pra-wam/cards";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { adminCards, saveTiers } from "@/lib/server/pra-wam/cards-admin";

export const dynamic = "force-dynamic";

/** PUT {tiers}: the levels' names, colours, odds (adding up to 100 %) and caps (any admin). Cards already drawn keep their level. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await saveTiers(validate(tiersSchema, await readJson(request, 10_000)));
    return success({ cards: await adminCards() }, "Level disimpan. Kartu yang sudah keluar tidak berubah.");
  });
}

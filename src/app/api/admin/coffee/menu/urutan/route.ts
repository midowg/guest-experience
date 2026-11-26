import { drinkOrderSchema } from "@/lib/coffee/schemas";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { sortDrinks } from "@/lib/server/coffee/menu";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** PUT {slugs}: the menu's order, every drink once. Answers the menu as it is afterwards. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await enforceRateLimit(request, "coffee-menu", 120);
    const { slugs } = validate(drinkOrderSchema, await readJson(request, 30_000));
    return success(await sortDrinks(slugs), "Urutan menu disimpan.");
  });
}

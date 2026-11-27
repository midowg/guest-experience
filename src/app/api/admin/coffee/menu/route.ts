import { drinkSchema } from "@/lib/coffee/schemas";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { adminMenu, createDrink } from "@/lib/server/coffee/menu";
import { coffeeActor } from "@/lib/server/coffee/session";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET: the whole menu, hidden drinks included, with how often each was ordered (read fresh, never from the kept copy). */
export async function GET() {
  return handle(async () => {
    await requireApiAdmin();
    return success(await adminMenu(), "");
  });
}

/** POST {name, description, group, temperatures, active, guestBook?, regular?}: a new drink at the end of the menu. Its slug is made from the name. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await enforceRateLimit(request, "coffee-menu", 120);
    const input = validate(drinkSchema, await readJson(request, 4_000));
    const drink = await createDrink(input, await coffeeActor());
    return success({ drink }, `${drink.name} ditambahkan ke menu.`);
  });
}

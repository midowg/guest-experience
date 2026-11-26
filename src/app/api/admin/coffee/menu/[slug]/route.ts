import { drinkSchema, drinkShownSchema, drinkSlugSchema } from "@/lib/coffee/schemas";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { deleteDrink, showDrink, updateDrink } from "@/lib/server/coffee/menu";
import { coffeeActor } from "@/lib/server/coffee/session";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };

/** PUT {name, description, group, temperatures, active}: change a drink. Orders already made keep the name they were ordered under. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await enforceRateLimit(request, "coffee-menu", 120);
    const slug = validate(drinkSlugSchema, (await params).slug);
    const input = validate(drinkSchema, await readJson(request, 4_000));
    const drink = await updateDrink(slug, input, await coffeeActor());
    return success({ drink }, `${drink.name} disimpan.`);
  });
}

/** PATCH {active}: hide a drink (it can no longer be ordered, the history keeps it) or show it again. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await enforceRateLimit(request, "coffee-menu", 120);
    const slug = validate(drinkSlugSchema, (await params).slug);
    const { active } = validate(drinkShownSchema, await readJson(request, 200));
    const drink = await showDrink(slug, active, await coffeeActor());
    return success({ drink }, active ? `${drink.name} tampil lagi di menu.` : `${drink.name} disembunyikan. Tidak bisa dipesan, riwayatnya tetap ada.`);
  });
}

/** DELETE: only a drink no order ever used; 409 otherwise (hide it instead). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await enforceRateLimit(request, "coffee-menu", 120);
    const slug = validate(drinkSlugSchema, (await params).slug);
    await deleteDrink(slug);
    return success({ slug }, "Minuman dihapus dari menu.");
  });
}

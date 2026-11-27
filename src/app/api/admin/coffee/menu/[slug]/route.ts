import { drinkSchema, drinkShownSchema, drinkSlugSchema } from "@/lib/coffee/schemas";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { placesWords } from "@/lib/coffee/menu";
import { deleteDrink, patchDrink, updateDrink } from "@/lib/server/coffee/menu";
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

/**
 * PATCH {active?, guestBook?, regular?}: from the list, without the editor. `active`: hide a drink
 * (it can no longer be ordered, the history keeps it) or show it again. `guestBook` / `regular`:
 * where it shows (the guest menu book and Tamu lines; the employee app, Tim · rapat lines and claims).
 */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await enforceRateLimit(request, "coffee-menu", 120);
    const slug = validate(drinkSlugSchema, (await params).slug);
    const patch = validate(drinkShownSchema, await readJson(request, 200));
    const drink = await patchDrink(slug, patch, await coffeeActor());
    if (patch.active === undefined) return success({ drink }, `${drink.name} kini ${placesWords(drink)}.`);
    return success({ drink }, patch.active ? `${drink.name} tampil lagi di menu.` : `${drink.name} disembunyikan. Tidak bisa dipesan, riwayatnya tetap ada.`);
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

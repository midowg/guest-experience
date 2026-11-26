import { gaPinSchema } from "@/lib/coffee/schemas";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { saveGaPin } from "@/lib/server/coffee/pin";
import { coffeeActor } from "@/lib/server/coffee/session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** PUT {pin}: the pengelola sets or replaces the PIN GA (four digits). The answer only says that one is set. */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { pin } = validate(gaPinSchema, await readJson(request, 200));
    await saveGaPin(pin, await coffeeActor());
    return success({ gaPin: true }, "PIN GA disimpan. Beri tahu petugas GA.");
  });
}

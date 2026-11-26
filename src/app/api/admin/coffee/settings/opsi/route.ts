import { optionsSchema } from "@/lib/coffee/schemas";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { coffeeActor } from "@/lib/server/coffee/session";
import { saveOptions } from "@/lib/server/coffee/settings";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * PUT {klaim, tim, tamu: {suhu, gula, es}}: which options each audience is asked with a drink
 * (F6). They hold from the next order on; orders already made keep what they carry. 503 while
 * migration 202612020001 has not run.
 */
export async function PUT(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    await enforceRateLimit(request, "coffee-opsi", 60);
    const input = validate(optionsSchema, await readJson(request, 1_000));
    return success({ options: await saveOptions(input, await coffeeActor()) }, "Opsi minuman disimpan. Berlaku mulai pesanan berikutnya.");
  });
}

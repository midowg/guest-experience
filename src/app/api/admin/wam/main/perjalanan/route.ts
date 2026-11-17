import { tripInputSchema } from "@/lib/main-wam/admin/trips";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { createTrip } from "@/lib/server/main-wam/admin/trips";

export const dynamic = "force-dynamic";

/** POST a step of Perjalanan (kumpul, kereta, shuttle, tiba): answers with every step and seat. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(tripInputSchema, await readJson(request, 10_000));
    return success(await createTrip(input), `${input.title} ditambahkan.`);
  });
}

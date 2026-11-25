import { manualSchema } from "@/lib/coffee/schemas";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { recordManual } from "@/lib/server/coffee/queue";
import { coffeeActor } from "@/lib/server/coffee/session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST: Catat manual, a request made outside the app, saved as done. A claim is refused (409) when that month's quota is full. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const input = validate(manualSchema, await readJson(request, 4_000));
    const { order, message } = await recordManual(input, await coffeeActor());
    return success({ order }, message);
  });
}

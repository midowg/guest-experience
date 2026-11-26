import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { finishOrder } from "@/lib/server/coffee/queue";
import { coffeeActor } from "@/lib/server/coffee/session";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST: Selesai diproses (bought in JumpStart). 409 when someone else processed it first. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid("Pesanan tidak dikenali."), (await params).id);
    return success({ order: await finishOrder(id, await coffeeActor()) }, "Selesai diproses.");
  });
}

import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { cancelManual } from "@/lib/server/coffee/queue";
import { coffeeActor } from "@/lib/server/coffee/session";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST: Batalkan catatan, a record made by hand (Catat manual) that was wrong: kept as "batal", its place in the quota free again. Orders made in the app answer 409. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid("Pesanan tidak dikenali."), (await params).id);
    const { order, message } = await cancelManual(id, await coffeeActor());
    return success({ order }, message);
  });
}

import { z } from "zod";
import { rejectSchema } from "@/lib/coffee/schemas";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { rejectOrder } from "@/lib/server/coffee/queue";
import { coffeeActor } from "@/lib/server/coffee/session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {note}: Tolak, with the note the one who ordered reads. 409 when someone else processed it first. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = validate(z.uuid("Pesanan tidak dikenali."), (await params).id);
    const { note } = validate(rejectSchema, await readJson(request, 2_000));
    return success({ order: await rejectOrder(id, note, await coffeeActor()) }, "Ditolak. Pemesan diberi tahu beserta catatannya.");
  });
}

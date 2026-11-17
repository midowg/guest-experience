import { isId } from "@/lib/main-wam/admin/requests";
import { tripInputSchema } from "@/lib/main-wam/admin/trips";
import { ServiceError } from "@/lib/server/config";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { deleteTrip, updateTrip } from "@/lib/server/main-wam/admin/trips";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

async function tripId(params: Params["params"]): Promise<string> {
  const { id } = await params;
  if (!isId(id)) throw new ServiceError(404, "Langkah perjalanan tidak ditemukan.");
  return id;
}

export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = await tripId(params);
    const input = validate(tripInputSchema, await readJson(request, 10_000));
    return success(await updateTrip(id, input), `${input.title} tersimpan.`);
  });
}

/** DELETE: the step and its seats. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = await tripId(params);
    return success(await deleteTrip(id), "Langkah perjalanan dihapus.");
  });
}

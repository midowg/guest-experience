import { isId } from "@/lib/main-wam/admin/requests";
import { seatsInputSchema } from "@/lib/main-wam/admin/trips";
import { ServiceError } from "@/lib/server/config";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { setSeats } from "@/lib/server/main-wam/admin/trips";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** PUT {seats, replace}: kursi and kendaraan of one step (typed or pasted); `replace` clears everyone not listed. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { id } = await params;
    if (!isId(id)) throw new ServiceError(404, "Langkah perjalanan tidak ditemukan.");
    const input = validate(seatsInputSchema, await readJson(request, 200_000));
    const result = await setSeats(id, input);
    return success(result, `Kursi ${result.saved} orang tersimpan.`);
  });
}

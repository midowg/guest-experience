import { z } from "zod";
import { handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { personDetail } from "@/lib/server/wellbeing/admin";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

/** GET: one employee's points, per dimension, latest activities and admin points. */
export async function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    await requireApiAdmin();
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new ServiceError(404, "Karyawan tidak ditemukan.");
    return success(await personDetail(id.data), "Detail dimuat.");
  });
}

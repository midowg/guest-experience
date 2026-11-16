import { z } from "zod";
import { checkOrigin, handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { voidBatch, wellbeingActor } from "@/lib/server/wellbeing/admin";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ batchId: string }> };

/** DELETE: Urungkan one Tambah poin (?employee= for one person only): its points stop counting (kept and marked). */
export async function DELETE(request: Request, { params }: Context) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const id = z.uuid().safeParse((await params).batchId);
    if (!id.success) throw new ServiceError(404, "Poin ini tidak ditemukan.");
    const employee = z.uuid().optional().safeParse(new URL(request.url).searchParams.get("employee") ?? undefined);
    if (!employee.success) throw new ServiceError(404, "Karyawan tidak ditemukan.");
    const result = await voidBatch(id.data, await wellbeingActor(), employee.data);
    return success(result, employee.data ? "Poin ini dibatalkan." : `Poin untuk ${result.count} orang diurungkan.`);
  });
}

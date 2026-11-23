import { z } from "zod";
import { approveSchema } from "@/lib/main-wam/modul/awards";
import { currentAdmin, requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { approveWinner } from "@/lib/server/main-wam/modul/awards";
import { limitPerson } from "@/lib/server/main-wam/modul/rate";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * POST {nomineeId}: an admin approves the winner from Admin WAM 2026 → Awarding (voting: after it
 * closes; jury: any time). Panitia are told. A personal admin is recorded by employee id; the super
 * admin and the shared password have none, so the approver is stored NULL and only named in the note.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const actor = await currentAdmin();
    if (!actor) throw new ServiceError(401, "Sesi berakhir. Masuk kembali sebelum melanjutkan.");
    const categoryId = validate(z.uuid("Kategori tidak dikenali."), (await params).id);
    const { nomineeId } = validate(approveSchema, await readJson(request, 1_000));
    const approver = { id: actor.kind === "person" ? actor.employeeId : null, name: actor.name };
    await limitPerson("setujui-admin", approver.id ?? actor.kind, 20);
    return success(await approveWinner(categoryId, nomineeId, approver, new Date()), "Pemenang disetujui. Panitia diberi kabar.");
  });
}

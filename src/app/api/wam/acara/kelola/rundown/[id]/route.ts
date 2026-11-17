import { rundownChangeSchema } from "@/lib/main-wam/panitia/schemas";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { apiOnlyFor, limitPerPerson } from "@/lib/server/main-wam/panitia/common";
import { changeSession } from "@/lib/server/main-wam/panitia/rundown";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * PATCH (K02/K03, panitia): Ubah jam (with the sessions that move), Pindah tempat, Batalkan or
 * Kembalikan sesi; "Kabari peserta" sends one note. 409 when someone changed it meanwhile.
 */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const context = apiOnlyFor(await requireMainWamApi(), "kelola");
    checkOrigin(request);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ServiceError(404, "Sesi tidak ditemukan.");
    await limitPerPerson("rundown", context.viewer.id, 60);
    const answer = await changeSession(context, id, validate(rundownChangeSchema, await readJson(request, 20_000)));
    return success(answer, answer.notified ? `Kabar terkirim ke ${answer.recipients} orang.` : "Jadwal tersimpan.");
  });
}

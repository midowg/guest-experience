import { presentSchema } from "@/lib/main-wam/panitia/schemas";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { sessionRows, setAttendance } from "@/lib/server/main-wam/panitia/attendance";
import { apiOnlyFor, limitPerPerson } from "@/lib/server/main-wam/panitia/common";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ sesiId: string }> };
const sessionId = async ({ params }: Params) => {
  const { sesiId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sesiId)) throw new ServiceError(404, "Sesi tidak ditemukan.");
  return sesiId;
};

/** GET: who is present at a session (K05, panitia, module Absen QR). */
export async function GET(_request: Request, context: Params) {
  return handle(async () => {
    apiOnlyFor(await requireMainWamApi(), "kelola", "absen");
    const { rows } = await sessionRows(await sessionId(context));
    return success({ rows }, "Daftar hadir dimuat.");
  });
}

/** POST {employeeId, present}: Catat hadir, or its undo. */
export async function POST(request: Request, context: Params) {
  return handle(async () => {
    const gate = apiOnlyFor(await requireMainWamApi(), "kelola", "absen");
    checkOrigin(request);
    const id = await sessionId(context);
    await limitPerPerson("absen", gate.viewer.id, 300);
    const input = validate(presentSchema, await readJson(request, 2_000));
    return success(await setAttendance(gate, id, input.employeeId, input.present), input.present ? "Dicatat hadir." : "Hadir dibatalkan.");
  });
}

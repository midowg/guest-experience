import { checkInBodySchema, isQrToken } from "@/lib/main-wam/modul/absen";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireQrAbsenApi } from "@/lib/server/main-wam/gate";
import { checkInWithQr } from "@/lib/server/main-wam/modul/absen";
import { limitPerson } from "@/lib/server/main-wam/modul/rate";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ token: string }> };

/**
 * POST {scannedAt?}: check in with a session's QR (A01 → A02/A03/A04). Module Absen QR only (404
 * while it is off). BOD get "tidak perlu absen" rather than a refusal. A scan queued offline sends
 * the time it was scanned; the server keeps it only within limits.
 */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const { viewer, settings } = await requireQrAbsenApi();
    checkOrigin(request);
    const { token } = await params;
    if (!isQrToken(token)) throw new ServiceError(404, "QR tidak dikenali.");
    const body = validate(checkInBodySchema, await readJson(request, 1_000));
    await limitPerson("absen", viewer.id, 30);
    const outcome = await checkInWithQr(token, viewer, { now: new Date(), scannedAt: body.scannedAt, ceklis: settings.modules.ceklis });
    return success(outcome, outcome.kind === "tercatat" ? "Absen tercatat." : "");
  });
}

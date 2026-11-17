import { z } from "zod";
import { mainWamCan } from "@/lib/main-wam/access";
import { absolute, mainWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { requireModuleApi } from "@/lib/server/main-wam/gate";
import { sessionQrSheet, sessionQrToken } from "@/lib/server/main-wam/modul/absen";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ sesiId: string }> };
const origin = (request: Request) => process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

/** Panitia and Admin WAM only, while module Absen QR is on. */
async function panitia() {
  const context = await requireModuleApi("absen");
  if (!mainWamCan(context.viewer, "kelola")) throw new ServiceError(403, "Hanya panitia yang bisa membuka QR absen.");
  return context;
}

/** GET: the session's QR on an A5 page, to print or show on a screen (the same QR until renewed). */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    await panitia();
    const id = validate(z.uuid("Sesi tidak dikenali."), (await params).sesiId);
    const { token, session } = await sessionQrToken(id);
    const pdf = await sessionQrSheet(session, absolute(origin(request), mainWamPath.checkIn(token)));
    return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="qr-absen-${id.slice(0, 8)}.pdf"`, "Cache-Control": "no-store" } });
  });
}

/** POST: a new QR; sheets printed before stop working. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await panitia();
    checkOrigin(request);
    await sessionQrToken(validate(z.uuid("Sesi tidak dikenali."), (await params).sesiId), true);
    return success(null, "QR baru dibuat. Cetak ulang dan ganti lembar lama.");
  });
}

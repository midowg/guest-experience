import { z } from "zod";
import { qrOrigin } from "@/lib/site-url";
import { mainWamCan } from "@/lib/main-wam/access";
import { absolute, mainWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { requireModuleApi } from "@/lib/server/main-wam/gate";
import { sessionQrSheet, sessionQrToken } from "@/lib/server/main-wam/modul/absen";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ sesiId: string }> };
// Never localhost (24 Nov 2026): the address the request came to, else the public site.
const origin = (request: Request) => qrOrigin(new URL(request.url).origin);

/** Panitia and Admin WAM only, while module Absen QR is on; 404 for anyone else (one answer for "not for you", KONTRAK §9 #4). */
async function panitia() {
  const context = await requireModuleApi("absen");
  if (!mainWamCan(context.viewer, "kelola")) throw new ServiceError(404, "Halaman tidak ditemukan.");
  return context;
}

/** GET: the session's QR on an A5 page, to print or show on a screen (the same QR until renewed). Writes nothing (R15). */
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

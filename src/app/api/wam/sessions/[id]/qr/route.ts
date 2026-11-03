import { z } from "zod";
import { absolute, praWamPath } from "@/lib/routes";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { qrToken } from "@/lib/server/pra-wam/attendance";
import { sessionQrPdf } from "@/lib/server/pra-wam/qr-pdf";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { getSession } from "@/lib/server/pra-wam/sessions";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const origin = (request: Request) => process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

/** GET: the session's QR on an A5 page to print (panitia). */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    const id = validate(z.uuid(), (await params).id);
    const token = await qrToken(id, member);
    const session = await getSession(id, member);
    const pdf = await sessionQrPdf(session, absolute(origin(request), praWamPath.checkIn(token)));
    return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="qr-absen-${id.slice(0, 8)}.pdf"`, "Cache-Control": "no-store" } });
  });
}

/** POST: a new QR; sheets printed before stop working (panitia). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await qrToken(validate(z.uuid(), (await params).id), member, true);
    return success(null, "QR baru dibuat. Cetak ulang dan ganti lembar lama.");
  });
}

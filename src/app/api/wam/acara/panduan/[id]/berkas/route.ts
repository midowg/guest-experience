import { NextResponse } from "next/server";
import { ServiceError } from "@/lib/server/config";
import { handle } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { guideFileKey } from "@/lib/server/main-wam/read";
import { presignDownload } from "@/lib/server/r2";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * GET: a published guide's file (Denah, a PDF), for someone Main WAM is on for: a short-lived
 * signed address of the private storage (5 minutes), never cached by a shared cache.
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireMainWamApi();
    const { id } = await params;
    const file = await guideFileKey(id);
    if (!file) throw new ServiceError(404, "Berkas panduan tidak ditemukan.");
    const url = await presignDownload(file.key, { seconds: 300 }).catch(() => { throw new ServiceError(503, "Berkas belum dapat dibuka. Coba lagi sebentar."); });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" } });
  });
}

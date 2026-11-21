import { NextResponse } from "next/server";
import { ServiceError } from "@/lib/server/config";
import { handle } from "@/lib/server/http";
import { itemPhotoKey } from "@/lib/server/main-wam/ceklis/data";
import { requireModuleApi } from "@/lib/server/main-wam/gate";
import { presignDownload } from "@/lib/server/r2";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ itemId: string }> };

/** GET: a checklist item's photo of a published agenda, for someone Main WAM is on for: a short-lived signed address (5 minutes). */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireModuleApi("ceklis");
    const { itemId } = await params;
    const key = await itemPhotoKey(itemId);
    if (!key) throw new ServiceError(404, "Foto tidak ditemukan.");
    const url = await presignDownload(key, { seconds: 300 }).catch(() => { throw new ServiceError(503, "Foto belum dapat dibuka. Coba lagi sebentar."); });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" } });
  });
}

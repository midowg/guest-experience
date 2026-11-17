import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, validate } from "@/lib/server/http";
import { requireMainWamApi } from "@/lib/server/main-wam/gate";
import { parsePhotoSize, photoFileAddress } from "@/lib/server/main-wam/momen/files";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/**
 * GET ?ukuran=kecil|besar|ubin: the photo's file, a redirect to a short-lived storage address
 * (storage stays private). For whoever sees the photo, and panitia (moderation); otherwise 404.
 * The browser may reuse the redirect while the address surely works: 5 minutes for besar (it works
 * 10–15 minutes, audit L5), 50 minutes for kecil and ubin.
 */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const context = await requireMainWamApi();
    const id = validate(z.uuid(), (await params).id);
    const { address, cacheSeconds } = await photoFileAddress(context, id, parsePhotoSize(new URL(request.url).searchParams.get("ukuran")));
    return NextResponse.redirect(address, { status: 302, headers: { "Cache-Control": `private, max-age=${cacheSeconds}` } });
  });
}

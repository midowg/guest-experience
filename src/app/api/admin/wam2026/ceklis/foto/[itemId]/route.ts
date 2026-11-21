import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { handle } from "@/lib/server/http";
import { adminItemPhotoUrl } from "@/lib/server/main-wam/admin/ceklis";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ itemId: string }> };

/** GET: a checklist item's photo for the admin's editor (a short-lived signed address of the private storage). */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    const { itemId } = await params;
    const url = await adminItemPhotoUrl(itemId);
    if (!url) throw new ServiceError(404, "Foto tidak ditemukan.");
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" } });
  });
}

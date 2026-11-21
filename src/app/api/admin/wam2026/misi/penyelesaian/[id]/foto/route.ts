import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { handle, validate } from "@/lib/server/http";
import { proofRedirect } from "@/lib/server/main-wam/misi/admin";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** GET: the proof photo of a completion, a redirect to a short-lived storage address; 404 when it has none. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    const id = validate(z.uuid("Penyelesaian tidak dikenali."), (await params).id);
    const address = await proofRedirect(id);
    if (!address) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.redirect(address, { status: 302, headers: { "Cache-Control": "private, max-age=600" } });
  });
}

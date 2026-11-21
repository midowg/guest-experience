import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { facePhotoBytes, facePhotoUrl } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };

/**
 * GET: someone's reference photo. With ?lihat=1 a redirect to storage (to look at it); without,
 * the bytes from this site, so the admin's browser can read the face (no storage CORS needed).
 */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    const employeeId = validate(z.uuid(), (await params).employeeId);
    if (new URL(request.url).searchParams.get("lihat") === "1") return NextResponse.redirect(await facePhotoUrl(employeeId), { status: 302, headers: { "Cache-Control": "private, no-store" } });
    const file = await facePhotoBytes(employeeId);
    return new NextResponse(Buffer.from(file.bytes), { headers: { "Content-Type": file.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  });
}

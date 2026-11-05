import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, validate } from "@/lib/server/http";
import { proofViewUrl } from "@/lib/server/pra-wam/attendance";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; employeeId: string }> };

/** GET (panitia and BOD): one online check-in's Zoom screenshot, a redirect to a five-minute storage address. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const viewer = await requireApiMember();
    const { id, employeeId } = await params;
    const url = await proofViewUrl(validate(z.uuid(), id), validate(z.uuid(), employeeId), viewer);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  });
}

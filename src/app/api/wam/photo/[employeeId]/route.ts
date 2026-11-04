import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, validate } from "@/lib/server/http";
import { photoViewUrl } from "@/lib/server/pra-wam/photos";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };

/**
 * GET: someone's profile photo, for any signed-in member: a redirect to a short-lived storage
 * address. The browser keeps the redirect an hour; the address names the photo's version, so a new
 * photo is asked for again.
 */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiMember();
    const url = await photoViewUrl(validate(z.uuid(), (await params).employeeId));
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=3600" } });
  });
}

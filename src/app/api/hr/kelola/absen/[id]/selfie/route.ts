import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, validate } from "@/lib/server/http";
import { selfieUrl } from "@/lib/server/hr/attendance";
import { requireApiHrAdmin } from "@/lib/server/hr/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** GET: a redirect to the clock-in's selfie in private storage, valid for five minutes. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiHrAdmin();
    const id = validate(z.uuid(), (await params).id);
    return NextResponse.redirect(await selfieUrl(id), { status: 302, headers: { "Cache-Control": "private, no-store" } });
  });
}

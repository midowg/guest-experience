import { NextResponse } from "next/server";
import { z } from "zod";
import { momFileStartSchema } from "@/lib/pra-wam/minutes-file";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { deleteMinuteFile, minuteFileUrl, startMinuteFile } from "@/lib/server/pra-wam/minutes-file";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST {name, size}: agree the MoM file's upload (13 Nov 2026) and answer where the browser puts it. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-mom-file", 20);
    const id = validate(z.uuid(), (await params).id);
    return success(await startMinuteFile(id, validate(momFileStartSchema, await readJson(request, 1_000)), member), "Siap mengunggah.");
  });
}

/** GET: the MoM file, for whoever may read the MoM: a redirect to a short-lived storage address. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    const url = await minuteFileUrl(validate(z.uuid(), (await params).id), member);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
  });
}

/** DELETE: removes the MoM file (anyone who may write the MoM). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await deleteMinuteFile(validate(z.uuid(), (await params).id), member);
    return success(null, "Berkas MoM dihapus.");
  });
}

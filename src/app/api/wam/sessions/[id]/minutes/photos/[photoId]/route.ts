import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { deleteMinutePhoto, minutePhotoUrl } from "@/lib/server/pra-wam/minutes-photos";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; photoId: string }> };

/** GET: the meeting photo, for whoever may read its MoM: a redirect to a short-lived storage address. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    const { id, photoId } = await params;
    const url = await minutePhotoUrl(validate(z.uuid(), id), validate(z.uuid(), photoId), member);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=3600" } });
  });
}

/** DELETE: removes the photo (anyone who may write the MoM). Answers the photos left. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const { id, photoId } = await params;
    return success(await deleteMinutePhoto(validate(z.uuid(), id), validate(z.uuid(), photoId), member), "Foto dihapus.");
  });
}

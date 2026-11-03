import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, handle, success, validate } from "@/lib/server/http";
import { deleteDocument, downloadUrl } from "@/lib/server/pra-wam/documents";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** GET: open the document (a short-lived storage address), after checking the person may read it. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const url = await downloadUrl(validate(z.uuid(), (await params).id), await requireApiMember());
    return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } });
  });
}

/** DELETE: the uploader or panitia removes a document. */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await deleteDocument(validate(z.uuid(), (await params).id), member);
    return success(null, "Dokumen dihapus.");
  });
}

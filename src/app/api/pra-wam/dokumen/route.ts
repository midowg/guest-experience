import { documentFinishSchema } from "@/lib/pra-wam/documents";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { finishUpload, listDocuments } from "@/lib/server/pra-wam/documents";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** GET: the documents the person may read. */
export async function GET() {
  return handle(async () => success(await listDocuments(await requireApiMember()), "Dokumen dimuat."));
}

/** POST: the browser finished uploading; check the file and list it. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await finishUpload(validate(documentFinishSchema, await readJson(request, 4_000)), member);
    return success(null, "Dokumen diunggah.");
  });
}

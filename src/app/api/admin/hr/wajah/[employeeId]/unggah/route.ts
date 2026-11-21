import { z } from "zod";
import { photoStartSchema } from "@/lib/pra-wam/photo";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { startFaceUpload } from "@/lib/server/hr/attendance";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };

/** POST {mime, size}: where Admin HR's reference photo for this person goes (ten minutes); then POST {action: "unggah"} on the person. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const employeeId = validate(z.uuid(), (await params).employeeId);
    const input = validate(photoStartSchema, await readJson(request, 500));
    return success(await startFaceUpload(employeeId, input), "");
  });
}

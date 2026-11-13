import { z } from "zod";
import { momFileConfirmSchema } from "@/lib/pra-wam/minutes-file";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { confirmMinuteFile } from "@/lib/server/pra-wam/minutes-file";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST: the MoM file is in storage; check it and keep it as the meeting's MoM (13 Nov 2026). */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    return success(await confirmMinuteFile(id, validate(momFileConfirmSchema, await readJson(request, 2_000)), member), "Berkas MoM tersimpan.");
  });
}

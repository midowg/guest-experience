import { z } from "zod";
import { momPhotoConfirmSchema } from "@/lib/pra-wam/minutes-photos";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { confirmMinutePhoto } from "@/lib/server/pra-wam/minutes-photos";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** POST: the photo is in storage; check it and keep it with the meeting's MoM. Answers every photo. */
export async function POST(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    return success(await confirmMinutePhoto(id, validate(momPhotoConfirmSchema, await readJson(request, 2_000)), member), "Foto ditambahkan.");
  });
}

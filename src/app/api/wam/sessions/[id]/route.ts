import { z } from "zod";
import { sessionInputSchema } from "@/lib/pra-wam/sessions";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { deleteSession, getSession, saveSession } from "@/lib/server/pra-wam/sessions";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  return handle(async () => success(await getSession(validate(z.uuid(), (await params).id), await requireApiMember()), "Sesi dimuat."));
}

/** PATCH: change a session (panitia); `publish` publishes a draft. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const body = await readJson(request, 60_000);
    const { publish } = validate(z.object({ publish: z.boolean().optional() }), body);
    return success(await saveSession(validate(sessionInputSchema, body), member, { id, publish }), publish ? "Sesi diterbitkan." : "Sesi disimpan.");
  });
}

/** DELETE: remove a draft or cancelled session for good (panitia). */
export async function DELETE(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await deleteSession(validate(z.uuid(), (await params).id), member);
    return success(null, "Sesi dihapus.");
  });
}

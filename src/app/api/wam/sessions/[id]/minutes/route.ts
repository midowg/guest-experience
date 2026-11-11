import { z } from "zod";
import { minutesInputSchema } from "@/lib/pra-wam/minutes";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { minutesView, saveMinutes } from "@/lib/server/pra-wam/minutes";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { getSession } from "@/lib/server/pra-wam/sessions";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** GET: the meeting's MoM, for whoever may open the meeting (11 Nov 2026). */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    const session = await getSession(validate(z.uuid(), (await params).id), member);
    return success(await minutesView(session, member), "Notulen dimuat.");
  });
}

/** PUT: writes the MoM anew (anyone in the meeting, or panitia), once the meeting has started. */
export async function PUT(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const id = validate(z.uuid(), (await params).id);
    const input = validate(minutesInputSchema, await readJson(request, 60_000));
    return success(await saveMinutes(id, input, member), "Notulen disimpan.");
  });
}

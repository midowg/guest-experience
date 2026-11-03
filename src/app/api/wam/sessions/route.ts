import { z } from "zod";
import { sessionInputSchema } from "@/lib/pra-wam/sessions";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { listSessions, saveSession } from "@/lib/server/pra-wam/sessions";

export const dynamic = "force-dynamic";

/** GET: the sessions the person may see. */
export async function GET() {
  return handle(async () => success(await listSessions(await requireApiMember()), "Sesi dimuat."));
}

/** POST: a new session (panitia). `publish` puts it on the participants' agenda at once. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const body = await readJson(request, 60_000);
    const { publish } = validate(z.object({ publish: z.boolean().default(false) }), body);
    return success(await saveSession(validate(sessionInputSchema, body), member, { publish }), publish ? "Sesi diterbitkan." : "Draf sesi disimpan.");
  });
}

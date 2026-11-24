import { z } from "zod";
import { handle, success, validate } from "@/lib/server/http";
import { bodPersonAnswers } from "@/lib/server/pra-wam/bod-survey";
import { sameOriginRead } from "@/lib/server/pra-wam/hr-lock";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ employeeId: string }> };

/** GET: one person's questionnaire answers that BoD may read with a name (Data kuesioner → Orang). */
export async function GET(request: Request, { params }: Params) {
  return handle(async () => {
    const member = await requireApiMember();
    sameOriginRead(request);
    const employeeId = validate(z.uuid(), (await params).employeeId);
    return success(await bodPersonAnswers(member, employeeId));
  });
}

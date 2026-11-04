import { resetRequestSchema } from "@/lib/pra-wam/reset-requests";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { submitResetRequest } from "@/lib/server/pra-wam/reset-requests";

export const dynamic = "force-dynamic";

/**
 * POST: ask the admin WAM to reset the password to the shared first one. The answer is the same
 * whether or not the email has an account. (The emailed Supabase link is no longer sent from
 * here; /wam/reset-password stays for links sent before.)
 */
export async function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-forgot", 5);
    const input = validate(resetRequestSchema, await readJson(request, 2_000));
    const answer = await submitResetRequest(input);
    return success({ sent: answer.sent }, answer.message);
  });
}

import { passwordResetSchema } from "@/lib/pra-wam/password";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { completePasswordReset } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: set a new password with the token from the emailed link, then sign in on this device. */
export async function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-reset", 8);
    const { accessToken, next } = validate(passwordResetSchema, await readJson(request, 8_000));
    await completePasswordReset(accessToken, next);
    return success(null, "Password baru tersimpan.");
  });
}

import { passwordChangeSchema } from "@/lib/pra-wam/password";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { changePassword, requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** POST: change the person's own password; other devices are signed out. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-password", 8);
    const { current, next } = validate(passwordChangeSchema, await readJson(request, 2_000));
    await changePassword(member, current, next);
    return success(null, "Password baru tersimpan. Perangkat lain perlu masuk ulang.");
  });
}

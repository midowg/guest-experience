import { z } from "zod";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { signIn } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
const schema = z.object({ email: z.string().trim().min(3, "Isi email.").max(200), password: z.string().min(1, "Isi password.").max(200) });

/** POST: sign in to Pra WAM with the work email and password. */
export async function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-login", 8);
    const { email, password } = validate(schema, await readJson(request, 2_000));
    await signIn(email, password);
    return success(null, "Berhasil masuk.");
  });
}

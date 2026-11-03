import { z } from "zod";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { requestPasswordReset } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
const schema = z.object({ email: z.email("Isi email kantor yang valid.").max(200) });

/** POST: email a link to set a new password. Same answer whether or not the email has an account. */
export async function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    await enforceRateLimit(request, "pra-wam-forgot", 5);
    const { email } = validate(schema, await readJson(request, 2_000));
    await requestPasswordReset(email, process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin);
    return success(null, "Bila email ini terdaftar, tautan untuk membuat password baru sudah dikirim. Periksa kotak masuk dan folder spam.");
  });
}

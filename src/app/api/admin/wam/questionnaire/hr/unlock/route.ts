import { z } from "zod";
import { HR_PASSWORD_MAX } from "@/lib/pra-wam/hr-password";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { unlockHr } from "@/lib/server/pra-wam/hr-lock";

export const dynamic = "force-dynamic";
const schema = z.object({ password: z.string().min(1, "Isi password HR.").max(HR_PASSWORD_MAX, "Password HR terlalu panjang.") });

/** POST {password}: unlock Data HR on this browser for 30 minutes (signed in admins only; logged). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { password } = validate(schema, await readJson(request, 2_000));
    const expiresAt = await unlockHr(request, password);
    return success({ expiresAt }, "Data HR terbuka di perangkat ini.");
  });
}

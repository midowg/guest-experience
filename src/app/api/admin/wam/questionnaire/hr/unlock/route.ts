import { z } from "zod";
import { HR_EMAIL_MAX } from "@/lib/pra-wam/hr-access";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { unlockHr } from "@/lib/server/pra-wam/hr-lock";

export const dynamic = "force-dynamic";
const schema = z.object({ email: z.string().trim().min(1, "Isi email WAM.").max(HR_EMAIL_MAX, "Email terlalu panjang.") });

/** POST {email}: unlock Data HR on this browser for 30 minutes as that person (signed in admins only; logged). */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { email } = validate(schema, await readJson(request, 2_000));
    const unlocked = await unlockHr(request, email);
    return success(unlocked, `Data HR terbuka di perangkat ini, atas nama ${unlocked.name}.`);
  });
}

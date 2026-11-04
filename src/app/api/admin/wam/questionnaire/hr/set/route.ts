import { z } from "zod";
import { HR_PASSWORD_MAX } from "@/lib/pra-wam/hr-password";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { setFirstHrPassword } from "@/lib/server/pra-wam/hr-lock";

export const dynamic = "force-dynamic";
const schema = z.object({ password: z.string().max(HR_PASSWORD_MAX, "Password HR terlalu panjang.") });

/** POST {password}: the first HR password (any admin), only while none is set. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { password } = validate(schema, await readJson(request, 2_000));
    await setFirstHrPassword(request, password);
    return success(null, "Password HR disimpan. Data HR sekarang bisa dibuka dengan password ini.");
  });
}

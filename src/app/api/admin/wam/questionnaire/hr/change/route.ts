import { z } from "zod";
import { HR_PASSWORD_MAX } from "@/lib/pra-wam/hr-password";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { changeHrPassword } from "@/lib/server/pra-wam/hr-lock";

export const dynamic = "force-dynamic";
const schema = z.object({
  current: z.string().min(1, "Isi password HR yang sekarang.").max(HR_PASSWORD_MAX, "Password HR terlalu panjang."),
  password: z.string().max(HR_PASSWORD_MAX, "Password HR terlalu panjang."),
});

/** POST {current, password}: a new HR password (any admin who knows the current one). Every unlock ends. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    const { current, password } = validate(schema, await readJson(request, 2_000));
    await changeHrPassword(request, current, password);
    return success(null, "Password HR diganti. Semua perangkat yang membuka Data HR sudah terkunci.");
  });
}

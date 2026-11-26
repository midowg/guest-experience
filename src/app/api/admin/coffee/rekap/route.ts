import { recapQuerySchema } from "@/lib/coffee/schemas";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { recap } from "@/lib/server/coffee/recap";
import { handle, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET ?dari=&sampai=&jenis=&status=&q=: Rekap's rows (one per drink), their summary, and the span's title. */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    const query = validate(recapQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
    return success(await recap(query), "");
  });
}

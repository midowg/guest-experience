import { gaState } from "@/lib/server/coffee/meetings";
import { requireApiGa } from "@/lib/server/coffee/session";
import { handle, success } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET: today's meeting orders, the people to pick as PIC or team, and the rooms (Mode GA only). */
export async function GET() {
  return handle(async () => {
    const member = await requireApiGa();
    return success(await gaState(member), "");
  });
}

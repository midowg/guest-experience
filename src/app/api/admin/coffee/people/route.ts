import { z } from "zod";
import { wibMonth } from "@/lib/coffee/quota";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { activePeople } from "@/lib/server/coffee/people";
import { handle, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET ?bulan=YYYY-MM: the active employees to pick from, each with the claims that count in that month (this month when left out). */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    const asked = new URL(request.url).searchParams.get("bulan");
    const month = asked ? validate(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Bulan tidak dikenali."), asked) : wibMonth(new Date().toISOString());
    return success({ people: await activePeople(month), month }, "");
  });
}

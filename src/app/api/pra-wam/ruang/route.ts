import { z } from "zod";
import { managesSessions } from "@/lib/pra-wam/roles";
import { ServiceError } from "@/lib/server/config";
import { handle, success, validate } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { roomUses } from "@/lib/server/pra-wam/sessions";

export const dynamic = "force-dynamic";

/** GET ?tanggal=: what holds each room that day, for panitia picking a session's room. */
export async function GET(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    if (!managesSessions(member)) throw new ServiceError(403, "Hanya panitia yang bisa memilih ruang sesi.");
    const date = validate(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid."), new URL(request.url).searchParams.get("tanggal"));
    return success(await roomUses(date), "Pemakaian ruang dimuat.");
  });
}

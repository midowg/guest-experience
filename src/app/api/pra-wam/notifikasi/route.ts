import { z } from "zod";
import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { markRead, myNotifications } from "@/lib/server/pra-wam/announcements";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => success(await myNotifications(await requireApiMember()), "Notifikasi dimuat."));
}

/** POST {id?}: mark one notification read, or all of them. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const { id } = validate(z.object({ id: z.uuid().optional() }), await readJson(request, 1_000));
    await markRead(member, id);
    return success(null, id ? "Ditandai dibaca." : "Semua ditandai dibaca.");
  });
}

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { DEVICE_COOKIE, isDeviceId, SESSION_COOKIE } from "@/lib/admin-token";
import { recordAccess } from "@/lib/server/access-log";
import { clientInfo, currentAdmin } from "@/lib/server/admin-session";
import { checkOrigin, handle, success } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    const store = await cookies();
    const actor = await currentAdmin().catch(() => null);
    if (actor) {
      const device = store.get(DEVICE_COOKIE)?.value;
      await recordAccess("logout", clientInfo(request), isDeviceId(device) ? device : randomUUID(), false, actor.role,
        { employeeId: actor.kind === "person" ? actor.employeeId : null, actor: actor.kind === "shared" ? "Admin (password bersama)" : actor.name });
    }
    store.delete(SESSION_COOKIE);
    return success(null, "Anda sudah keluar.");
  });
}

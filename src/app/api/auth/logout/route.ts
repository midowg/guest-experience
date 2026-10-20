import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { adminAuthConfig, DEVICE_COOKIE, isDeviceId, SESSION_COOKIE, verifySession } from "@/lib/admin-token";
import { recordAccess } from "@/lib/server/access-log";
import { clientInfo } from "@/lib/server/admin-session";
import { checkOrigin, handle, success } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    const store = await cookies();
    if (verifySession(adminAuthConfig(), store.get(SESSION_COOKIE)?.value)) {
      const device = store.get(DEVICE_COOKIE)?.value;
      await recordAccess("logout", clientInfo(request), isDeviceId(device) ? device : randomUUID(), false);
    }
    store.delete(SESSION_COOKIE);
    return success(null, "Anda sudah keluar.");
  });
}

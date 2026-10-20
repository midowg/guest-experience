import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { adminAuthConfig, DEVICE_COOKIE, DEVICE_TTL_SECONDS, isDeviceId, passwordMatches, SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/admin-token";
import { isKnownDevice, recordAccess } from "@/lib/server/access-log";
import { clientInfo } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const schema = z.object({ password: z.string().min(1, "Isi password.").max(200) });

export async function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    const config = adminAuthConfig();
    if (!config) throw new ServiceError(503, "Login admin belum disiapkan. Isi ADMIN_PASSWORD dan ADMIN_SESSION_SECRET pada server.");
    await enforceRateLimit(request, "admin-login", 5);
    const { password } = validate(schema, await readJson(request, 2_000));
    const store = await cookies();
    const existing = store.get(DEVICE_COOKIE)?.value;
    const deviceId = isDeviceId(existing) ? existing : randomUUID();
    const ok = passwordMatches(config, password);
    const newDevice = ok ? (await isKnownDevice(deviceId)) === false : false;
    const client = clientInfo(request);
    const logged = await recordAccess(ok ? "login_success" : "login_failure", client, deviceId, newDevice);
    const secure = process.env.NODE_ENV === "production";
    // The device cookie is set on failures too, so repeated attempts from one browser line up in the log.
    store.set(DEVICE_COOKIE, deviceId, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: DEVICE_TTL_SECONDS });
    if (!ok) throw new ServiceError(401, "Password tidak cocok. Periksa lalu coba lagi.");
    store.set(SESSION_COOKIE, signSession(config), { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
    return success({ logged }, "Berhasil masuk.");
  });
}

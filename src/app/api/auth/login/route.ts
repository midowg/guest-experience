import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { adminAuthConfig, DEVICE_COOKIE, DEVICE_TTL_SECONDS, isDeviceId, passwordRole, SESSION_COOKIE, SESSION_TTL_SECONDS, signPersonSession, signSession } from "@/lib/admin-token";
import { isKnownDevice, recordAccess } from "@/lib/server/access-log";
import { grantsMigrated, signInPersonAdmin } from "@/lib/server/admin-actor";
import { clientInfo } from "@/lib/server/admin-session";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";
// 13 Nov 2026: an admin signs in with their WAM email or nama panggilan and password; the password
// alone is the super admin's (and the shared admin password's, until migration 202611130012).
const schema = z.object({ identifier: z.string().trim().max(200).optional(), password: z.string().min(1, "Isi password.").max(200) });

export async function POST(request: Request) {
  return handle(async () => {
    checkOrigin(request);
    const config = adminAuthConfig();
    if (!config) throw new ServiceError(503, "Login admin belum disiapkan. Isi ADMIN_PASSWORD dan ADMIN_SESSION_SECRET pada server.");
    await enforceRateLimit(request, "admin-login", 5);
    const { identifier, password } = validate(schema, await readJson(request, 2_000));
    const store = await cookies();
    const existing = store.get(DEVICE_COOKIE)?.value;
    const deviceId = isDeviceId(existing) ? existing : randomUUID();
    const client = clientInfo(request);
    const secure = process.env.NODE_ENV === "production";
    // The device cookie is set on failures too, so repeated attempts from one browser line up in the log.
    store.set(DEVICE_COOKIE, deviceId, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: DEVICE_TTL_SECONDS });

    if (identifier) {
      const person = await signInPersonAdmin(identifier, password).catch(async (error: unknown) => {
        await recordAccess("login_failure", client, deviceId, false, null, { actor: identifier });
        throw error;
      });
      const newDevice = (await isKnownDevice(deviceId)) === false;
      const logged = await recordAccess("login_success", client, deviceId, newDevice, "admin", { employeeId: person.employeeId, actor: person.name });
      store.set(SESSION_COOKIE, signPersonSession(config, person.employeeId, person.version), { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
      return success({ logged, role: "admin" as const, name: person.name }, `Berhasil masuk sebagai ${person.name}.`);
    }

    const matched = passwordRole(config, password);
    // The shared admin password ends with migration 202611130012: each admin uses their own account.
    const retired = matched === "admin" && await grantsMigrated().catch(() => true);
    const role = retired ? null : matched;
    const newDevice = role ? (await isKnownDevice(deviceId)) === false : false;
    const logged = await recordAccess(role ? "login_success" : "login_failure", client, deviceId, newDevice, role, { actor: role === "super" ? "Super admin" : role === "admin" ? "Admin (password bersama)" : retired ? "Password admin bersama (sudah tidak dipakai)" : null });
    if (retired) throw new ServiceError(401, "Password admin bersama sudah tidak dipakai. Masuk dengan email atau nama panggilan dan password WAM Anda.");
    if (!role) throw new ServiceError(401, "Password tidak cocok. Periksa lalu coba lagi.");
    store.set(SESSION_COOKIE, signSession(config, role), { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
    return success({ logged, role }, role === "super" ? "Berhasil masuk sebagai super admin." : "Berhasil masuk.");
  });
}

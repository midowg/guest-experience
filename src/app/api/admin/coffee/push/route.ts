import { pushEndpointSchema } from "@/lib/pra-wam/push";
import { coffeePushSchema } from "@/lib/coffee/schemas";
import { currentAdmin, requireApiAdmin } from "@/lib/server/admin-session";
import { pushInfo, removeSubscription, saveSubscription } from "@/lib/server/coffee/push";
import { COFFEE_NETWORK_LIMIT, limitCoffeePerson } from "@/lib/server/coffee/rate";
import { ServiceError } from "@/lib/server/config";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/*
 * Web push for the pengelola (F4): new claims and meeting orders reach this device. A notification
 * goes to a person, so only someone signed in to the admin with their own employee account can
 * turn it on; the super admin's sign-in belongs to nobody (409).
 */
const NEEDS_PERSON = "Masuk dengan akun karyawan untuk menerima notifikasi.";

/** The employee behind the admin session: the grant was checked by requireApiAdmin (and the proxy). */
async function pengelola(): Promise<string> {
  await requireApiAdmin();
  const actor = await currentAdmin();
  if (actor?.kind !== "person") throw new ServiceError(409, NEEDS_PERSON);
  return actor.employeeId;
}

/** GET: the public key to subscribe with; null (and why) while the server cannot send yet. */
export async function GET() {
  return handle(async () => {
    await pengelola();
    return success(await pushInfo(), "Siap.");
  });
}

/** POST {subscription, device}: this device gets the pengelola's notifications. */
export async function POST(request: Request) {
  return handle(async () => {
    const employeeId = await pengelola();
    checkOrigin(request);
    await enforceRateLimit(request, "coffee-push", COFFEE_NETWORK_LIMIT);
    await limitCoffeePerson("push", employeeId, 30);
    const { subscription, device } = validate(coffeePushSchema, await readJson(request, 4_000));
    await saveSubscription(employeeId, { endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, device });
    return success(null, "Notifikasi di perangkat ini aktif.");
  });
}

/** DELETE {endpoint}: this device stops getting notifications. */
export async function DELETE(request: Request) {
  return handle(async () => {
    const employeeId = await pengelola();
    checkOrigin(request);
    const { endpoint } = validate(pushEndpointSchema, await readJson(request, 3_000));
    await removeSubscription(employeeId, endpoint);
    return success(null, "Notifikasi di perangkat ini dimatikan.");
  });
}

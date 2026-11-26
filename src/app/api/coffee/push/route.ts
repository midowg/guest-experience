import { pushEndpointSchema } from "@/lib/pra-wam/push";
import { coffeePushSchema } from "@/lib/coffee/schemas";
import { pushInfo, removeSubscription, saveSubscription } from "@/lib/server/coffee/push";
import { COFFEE_NETWORK_LIMIT, limitCoffeePerson } from "@/lib/server/coffee/rate";
import { checkOrigin, enforceRateLimit, handle, readJson, success, validate } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/*
 * Web push for the employee app and GA's tablet (F4). A device belongs to whoever is signed in:
 * the person is always the session's, never an id from the request.
 */

/** GET: the public key to subscribe with; null (and why) while the server cannot send yet. */
export async function GET() {
  return handle(async () => {
    await requireApiMember();
    return success(await pushInfo(), "Siap.");
  });
}

/** POST {subscription, device}: this device gets the signed-in person's notifications. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, "coffee-push", COFFEE_NETWORK_LIMIT);
    await limitCoffeePerson("push", member.id, 30);
    const { subscription, device } = validate(coffeePushSchema, await readJson(request, 4_000));
    await saveSubscription(member.id, { endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, device });
    return success(null, "Notifikasi di perangkat ini aktif.");
  });
}

/** DELETE {endpoint}: this device stops getting notifications (turned off, or the person signs out). */
export async function DELETE(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const { endpoint } = validate(pushEndpointSchema, await readJson(request, 3_000));
    await removeSubscription(member.id, endpoint);
    return success(null, "Notifikasi di perangkat ini dimatikan.");
  });
}

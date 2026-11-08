import { checkOrigin, handle, readJson, success, validate } from "@/lib/server/http";
import { pushEndpointSchema, pushSubscriptionSchema } from "@/lib/pra-wam/push";
import { pushPublicKey, removeSubscription, saveSubscription } from "@/lib/server/pra-wam/push";
import { requireApiMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";

/** GET: the public key to subscribe with; null while the server has no VAPID keys yet. */
export async function GET() {
  return handle(async () => {
    await requireApiMember();
    return success({ publicKey: pushPublicKey() }, "Siap.");
  });
}

/** POST {subscription, device}: this phone gets the person's notifications. */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const { subscription, device } = validate(pushSubscriptionSchema, await readJson(request, 4_000));
    await saveSubscription(member, { endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, device });
    return success(null, "Notifikasi di HP ini aktif.");
  });
}

/** DELETE {endpoint}: this phone stops getting notifications. */
export async function DELETE(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    const { endpoint } = validate(pushEndpointSchema, await readJson(request, 3_000));
    await removeSubscription(member, endpoint);
    return success(null, "Notifikasi di HP ini dimatikan.");
  });
}

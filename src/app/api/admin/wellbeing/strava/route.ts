import { checkOrigin, handle, success } from "@/lib/server/http";
import { requireApiAdmin } from "@/lib/server/admin-session";
import { wellbeingApi } from "@/lib/routes";
import { stravaAdmin, subscribeStrava } from "@/lib/server/wellbeing/strava";

export const dynamic = "force-dynamic";

/** The webhook address: this site's (journey.werkudara.group in production). */
const callbackOf = (request: Request) => `${new URL(request.url).origin}${wellbeingApi.stravaWebhook}`;

/** GET: Pengaturan → Strava: keys, migration, webhook, how many connected. */
export async function GET(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    return success(await stravaAdmin(callbackOf(request)), "Status Strava dimuat.");
  });
}

/** POST: Aktifkan webhook (one per Strava app). Strava checks the address at once. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireApiAdmin();
    checkOrigin(request);
    return success(await subscribeStrava(callbackOf(request)), "Webhook Strava aktif. Aktivitas baru akan masuk otomatis.");
  });
}

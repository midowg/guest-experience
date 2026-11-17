import { checkOrigin, handle, success } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { disconnectStrava, stravaStatus } from "@/lib/server/wellbeing/strava";

export const dynamic = "force-dynamic";

/** GET: my Strava connection (Profil, the Strava sheet). Never a token. */
export async function GET() {
  return handle(async () => success(await stravaStatus(await requireApiMember()), "Status Strava dimuat."));
}

/** DELETE: Putuskan Strava. Strava forgets WLM for me; activities already counted stay. */
export async function DELETE(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await disconnectStrava(member);
    return success(await stravaStatus(member), "Strava diputus. Aktivitas yang sudah masuk tetap dihitung.");
  });
}

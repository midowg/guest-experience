import { checkOrigin, enforceRateLimit, handle, success } from "@/lib/server/http";
import { requireApiMember } from "@/lib/server/pra-wam/session";
import { syncStrava } from "@/lib/server/wellbeing/strava";

export const dynamic = "force-dynamic";

/** POST: Sinkronkan sekarang. Reads this month's Strava activities again; a few times per 10 minutes per person (Strava's quota is the office's). */
export async function POST(request: Request) {
  return handle(async () => {
    const member = await requireApiMember();
    checkOrigin(request);
    await enforceRateLimit(request, `wellbeing-strava-sync:${member.id}`, 4);
    const result = await syncStrava(member.id);
    return success(result, result.added ? `${result.added} aktivitas baru dari Strava.` : "Sudah terbaru. Tidak ada aktivitas baru.");
  });
}

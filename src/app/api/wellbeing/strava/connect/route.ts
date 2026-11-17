import { NextResponse } from "next/server";
import { wellbeingApi, wellbeingPath } from "@/lib/routes";
import { currentMember } from "@/lib/server/pra-wam/session";
import { authorizeUrl, stravaConfig } from "@/lib/server/wellbeing/strava";

export const dynamic = "force-dynamic";

/**
 * GET (a page visit from the Strava sheet): off to Strava's page to allow WLM. Not signed in: WLM's
 * sign-in first, then back to Profil. The way back is this site's own callback.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const member = await currentMember();
  if (!member) return NextResponse.redirect(new URL(wellbeingPath.login(wellbeingPath.section("profil")), origin));
  if (!stravaConfig()) return NextResponse.redirect(new URL(`${wellbeingPath.section("profil")}?strava=belum-siap`, origin));
  return NextResponse.redirect(authorizeUrl(member, `${origin}${wellbeingApi.stravaCallback}`));
}

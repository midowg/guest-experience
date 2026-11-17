import { after, NextResponse } from "next/server";
import { wellbeingPath } from "@/lib/routes";
import { currentMember } from "@/lib/server/pra-wam/session";
import { ConnectError, connectStrava, syncStrava } from "@/lib/server/wellbeing/strava";

export const dynamic = "force-dynamic";

/**
 * GET: Strava sends the person back here. Signed in as the one who started (the state says who), with
 * the activity permission: the connection is kept, this month's activities are read after the
 * answer, and Profil opens with the result (?strava=tersambung, or what went wrong).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (result: string) => NextResponse.redirect(new URL(`${wellbeingPath.section("profil")}?strava=${result}`, url.origin));
  const member = await currentMember();
  if (!member) return NextResponse.redirect(new URL(wellbeingPath.login(wellbeingPath.section("profil")), url.origin));
  if (url.searchParams.get("error")) return back("batal");
  const code = url.searchParams.get("code"), state = url.searchParams.get("state");
  if (!code || !state) return back("gagal");
  try {
    await connectStrava(member, { code, state, scope: url.searchParams.get("scope") ?? "" });
  } catch (error) {
    if (error instanceof ConnectError) return back(error.problem);
    console.error("Strava connect failed", error instanceof Error ? error.message : error);
    return back("gagal");
  }
  after(async () => {
    try { await syncStrava(member.id); } catch (error) { console.error("Strava first sync failed", error instanceof Error ? error.message : error); }
  });
  return back("tersambung");
}

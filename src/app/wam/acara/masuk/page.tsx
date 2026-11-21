import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/main-wam/peserta/masuk/LoginScreen";
import { barlow } from "@/components/main-wam/peserta/masuk/font";
import { Splash } from "@/components/main-wam/peserta/masuk/Splash";
import { eventDateRange, splashSubtitle } from "@/lib/main-wam/peserta/splash";
import { themeInputOf } from "@/lib/main-wam/theme-image";
import { safePraWamNext } from "@/lib/pra-wam/next-path";
import { mainWamPath, praWamPath } from "@/lib/routes";
import { readLang } from "@/lib/server/main-wam/lang";
import { readMainWamSettings } from "@/lib/server/main-wam/settings";
import { currentMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk · WAM", robots: { index: false } };

/**
 * O02 Masuk, Main WAM's own sign-in: the same account and API as WAM (praWamApi.login), drawn in
 * Main WAM's theme. Owner A (peserta). Rules (KONTRAK §3): it shows only in mode semua (otherwise
 * WAM's own sign-in, so Main WAM's look never reaches someone it is not on for), a signed-in person
 * goes straight on, and `next` is checked with safePraWamNext (never a sign-in page). O01 Splash
 * opens it briefly (once per session, never holding sign-in up).
 */
export default async function MainWamLoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const asked = (await searchParams).next;
  const next = safePraWamNext(Array.isArray(asked) ? asked[0] : asked) ?? mainWamPath.home;
  if (await currentMember().catch(() => null)) redirect(next);
  const settings = await readMainWamSettings();
  if (settings.mode !== "semua") redirect(praWamPath.login(next));
  const { event } = settings;
  const lang = await readLang();
  return <div className={barlow.variable}>
    <Splash title={event.name} subtitle={splashSubtitle(event.name)} dates={eventDateRange(event.startDate, event.endDate, lang)} venue={event.venue} image={!!themeInputOf(settings.theme).images?.splash} />
    <LoginScreen next={next} eventName={event.name} />
  </div>;
}

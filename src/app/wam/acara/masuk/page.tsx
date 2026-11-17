import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/main-wam/peserta/masuk/LoginScreen";
import { safePraWamNext } from "@/lib/pra-wam/next-path";
import { mainWamPath, praWamPath } from "@/lib/routes";
import { readMainWamSettings } from "@/lib/server/main-wam/settings";
import { currentMember } from "@/lib/server/pra-wam/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk · WAM", robots: { index: false } };

/**
 * O02 Masuk, Main WAM's own sign-in: the same account and API as WAM (praWamApi.login), drawn in
 * Main WAM's theme. Owner A (peserta). Rules (KONTRAK §3): it shows only in mode semua (otherwise
 * WAM's own sign-in, so Main WAM's look never reaches someone it is not on for), a signed-in person
 * goes straight on, and `next` is checked with safePraWamNext (never a sign-in page).
 */
export default async function MainWamLoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const asked = (await searchParams).next;
  const next = safePraWamNext(Array.isArray(asked) ? asked[0] : asked) ?? mainWamPath.home;
  if (await currentMember().catch(() => null)) redirect(next);
  const settings = await readMainWamSettings();
  if (settings.mode !== "semua") redirect(praWamPath.login(next));
  return <LoginScreen next={next} eventName={settings.event.name} />;
}

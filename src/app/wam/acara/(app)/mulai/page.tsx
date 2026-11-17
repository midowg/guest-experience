import { OnboardingScreen } from "@/components/main-wam/peserta/mulai/OnboardingScreen";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";

export const dynamic = "force-dynamic";
export const metadata = { title: "Izin notifikasi · WAM", robots: { index: false } };

/** O03 Izin notifikasi, once after the first sign-in on a phone (Masuk sends here). Owner A (peserta); the gate first. */
export default async function OnboardingPage() {
  const { viewer, settings } = await requireMainWamPage(mainWamPath.onboarding);
  return <OnboardingScreen name={viewer.name} modules={settings.modules} />;
}

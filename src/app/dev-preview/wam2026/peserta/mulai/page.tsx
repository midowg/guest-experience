import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { OnboardingScreen } from "@/components/main-wam/peserta/mulai/OnboardingScreen";
import { mainWamPath } from "@/lib/routes";
import { previewTime } from "../sample";

export const dynamic = "force-dynamic";

/** O03 Izin notifikasi (dev-preview; nothing is asked): ?status=iphone|panduan, ?modul=mati (Absen QR and Silent Meeting off). */
export default async function PreviewOnboarding({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const { status, modul } = params;
  const lang = previewLang(params);
  const on = modul !== "mati";
  return <Frame path={mainWamPath.onboarding} now={previewTime({ waktu: "berangkat" })} lang={lang}>
    <OnboardingScreen name="Rani" modules={{ absen: on, silent: on }} preview={{ push: status === "iphone" || status === "panduan" ? "ios-install" : "off", guide: status === "panduan" }} />
  </Frame>;
}

import { notFound } from "next/navigation";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { OnboardingScreen } from "@/components/main-wam/peserta/mulai/OnboardingScreen";
import { mainWamPath } from "@/lib/routes";
import { previewTime } from "../sample";

export const dynamic = "force-dynamic";

/** O03 Izin notifikasi (dev-preview; nothing is asked): ?status=iphone|panduan, ?modul=mati (Absen QR and Silent Meeting off). */
export default async function PreviewOnboarding({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { status, modul } = await searchParams;
  const on = modul !== "mati";
  return <Frame path={mainWamPath.onboarding} now={previewTime({ waktu: "berangkat" })}>
    <OnboardingScreen name="Rani" modules={{ absen: on, silent: on }} preview={{ push: status === "iphone" || status === "panduan" ? "ios-install" : "off", guide: status === "panduan" }} />
  </Frame>;
}

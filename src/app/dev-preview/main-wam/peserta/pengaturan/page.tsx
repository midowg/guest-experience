import { notFound } from "next/navigation";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { SettingsScreen } from "@/components/main-wam/peserta/saya/SettingsScreen";
import type { PushState } from "@/components/main-wam/peserta/usePushDevice";
import { mainWamPath } from "@/lib/routes";
import { previewTime } from "../sample";

export const dynamic = "force-dynamic";
const STATES: PushState[] = ["on", "off", "denied", "ios-install", "unsupported", "not-ready", "checking"];

/** S02 Pengaturan (dev-preview): ?hp=on|off|denied|ios-install|unsupported|not-ready, ?buka=notifikasi|password. */
export default async function PreviewSettings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const push = STATES.find(state => state === params.hp) ?? "on";
  const open = params.buka === "notifikasi" || params.buka === "password" ? params.buka : undefined;
  return <Frame path={mainWamPath.settings} now={previewTime({ waktu: "pemaparan" })}>
    <SettingsScreen version="1.0" preview={{ push, open }} />
  </Frame>;
}

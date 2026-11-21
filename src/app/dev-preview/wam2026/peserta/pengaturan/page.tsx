import { notFound } from "next/navigation";
import { previewLang } from "@/components/main-wam/dev/lang";
// The frame (theme) first, so its reset comes before the screen's styles, as the app's layout does.
import { Frame } from "../Frame";
import { SettingsScreen } from "@/components/main-wam/peserta/saya/SettingsScreen";
import type { PushState } from "@/components/main-wam/peserta/usePushDevice";
import { t } from "@/lib/main-wam/i18n";
import { contactLinks } from "@/lib/main-wam/peserta/contact";
import { samplePeople } from "@/lib/main-wam/sample";
import { mainWamPath } from "@/lib/routes";
import { previewTime } from "../sample";

export const dynamic = "force-dynamic";
const STATES: PushState[] = ["on", "off", "denied", "ios-install", "unsupported", "not-ready", "checking"];
const PANELS = ["notifikasi", "pasang", "password", "panitia"] as const;

/**
 * S02 Pengaturan (dev-preview): ?hp=on|off|denied|ios-install|unsupported|not-ready, ?buka=notifikasi|pasang|password|panitia,
 * ?terpasang=1 (opened from the home screen), ?peran=bod (Akses MCP), ?kontak=tanpa (no panitia contact).
 */
export default async function PreviewSettings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const lang = previewLang(params);
  const push = STATES.find(state => state === params.hp) ?? "on";
  const open = PANELS.find(panel => panel === params.buka);
  const help = params.kontak === "tanpa" ? null : { id: samplePeople.putri.id, name: "Putri", role: t(lang, "peserta.contact.committee"), photo: null, ...contactLinks("0800-0000-0002") };
  return <Frame path={mainWamPath.settings} peran={params.peran} now={previewTime({ waktu: "pemaparan" })} lang={lang}>
    <SettingsScreen version="0.1.0" help={help} mcp={params.peran === "bod"} preview={{ push, open, installed: params.terpasang === "1" }} />
  </Frame>;
}

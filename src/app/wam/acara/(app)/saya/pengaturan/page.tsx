import { SettingsScreen } from "@/components/main-wam/peserta/saya/SettingsScreen";
import { mainWamPath } from "@/lib/routes";
import { readMainWamMode, readReduceMotion } from "@/lib/server/main-wam/appearance";
import { loadMe } from "@/lib/server/main-wam/peserta/saya";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
// A server page: only the version string reaches the browser.
import app from "../../../../../../../package.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengaturan · WAM", robots: { index: false } };

/** S02 Pengaturan. Owner A (peserta); the gate first. */
export default async function SettingsPage() {
  const context = await requireMainWamPage(mainWamPath.settings);
  const [{ mcp, help }, mode, reduceMotion] = await Promise.all([loadMe(context), readMainWamMode(), readReduceMotion()]);
  return <SettingsScreen version={app.version ?? "1.0"} mode={mode} reduceMotion={reduceMotion} help={help} mcp={mcp} />;
}

import { SettingsScreen } from "@/components/main-wam/peserta/saya/SettingsScreen";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
// A server page: only the version string reaches the browser.
import app from "../../../../../../../package.json";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pengaturan · WAM", robots: { index: false } };

/** S02 Pengaturan. Owner A (peserta); the gate first. */
export default async function SettingsPage() {
  await requireMainWamPage(mainWamPath.settings);
  return <SettingsScreen version={app.version ?? "1.0"} />;
}

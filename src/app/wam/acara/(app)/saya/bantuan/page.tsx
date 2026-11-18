import { HelpScreen } from "@/components/main-wam/peserta/saya/HelpScreen";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { loadMe } from "@/lib/server/main-wam/peserta/saya";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bantuan · WAM", robots: { index: false } };

/** Bantuan: how to use the app, common questions and the panitia contact. Owner A (peserta); the gate first. */
export default async function HelpPage() {
  const context = await requireMainWamPage(mainWamPath.help);
  const { help } = await loadMe(context);
  return <HelpScreen help={help} />;
}

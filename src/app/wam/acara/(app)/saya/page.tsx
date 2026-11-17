import { SayaScreen } from "@/components/main-wam/peserta/saya/SayaScreen";
import { profileLine, roomRow } from "@/lib/main-wam/peserta/saya";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { loadMe } from "@/lib/server/main-wam/peserta/saya";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saya · WAM", robots: { index: false } };

/** P05 Saya (BOD: P05B with Akses MCP; panitia: P05). Owner A (peserta); the gate first. */
export default async function SayaPage() {
  const context = await requireMainWamPage(mainWamPath.me);
  const { viewer } = context;
  const { mcp, help } = await loadMe(context);
  return <SayaScreen name={viewer.name} fullName={viewer.fullName} line={profileLine(viewer)} photo={viewer.photo}
    room={viewer.room ? roomRow(viewer.room) : null} mcp={mcp} help={help} />;
}

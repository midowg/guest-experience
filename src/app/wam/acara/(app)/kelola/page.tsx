import { PanitiaHub } from "@/components/main-wam/panitia/PanitiaHub";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { panitiaHome } from "@/lib/server/main-wam/panitia/summary";
import { kelolaTiles } from "@/lib/main-wam/panitia/attention";

export const dynamic = "force-dynamic";
export const metadata = { title: "Panitia · WAM", robots: { index: false } };

/**
 * K01 Panitia: the hub behind the fifth tab (Kelola, Perlu perhatian, sessions running now). Same gate
 * as the tools under it: panitia and Admin WAM; anyone else, not found. A part that cannot be read is left out.
 */
export default async function PanitiaPage() {
  const context = await requireActionPage("kelola", mainWamPath.committee);
  const now = new Date();
  const home = await panitiaHome(context, now).catch(() => ({ tiles: kelolaTiles(context.settings.modules, 0), attention: [], running: [] }));
  return <PanitiaHub tiles={home.tiles} attention={home.attention} running={home.running} />;
}

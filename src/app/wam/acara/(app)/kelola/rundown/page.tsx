import { RundownLive } from "@/components/main-wam/panitia/RundownLive";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { rundownLiveData } from "@/lib/server/main-wam/panitia/rundown";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rundown live · WAM", robots: { index: false } };

/** K02 Rundown live (K03 Ubah jam is its sheet). Panitia and Admin WAM only; anyone else: not found. */
export default async function RundownLivePage({ searchParams }: { searchParams: Promise<{ hari?: string }> }) {
  const { hari } = await searchParams;
  const context = await requireActionPage("kelola", mainWamPath.rundownLive(Number(hari) || undefined));
  const data = await rundownLiveData(context, hari);
  return <RundownLive {...data} me={context.viewer.name} />;
}

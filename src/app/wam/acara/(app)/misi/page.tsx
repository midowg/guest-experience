import { MisiScreen } from "@/components/main-wam/misi/MisiScreen";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { loadMisi } from "@/lib/server/main-wam/misi/read";

export const dynamic = "force-dynamic";
export const metadata = { title: "Misi · WAM", robots: { index: false } };

/** Misi: my points, my place, the missions and their sheets. Module Misi; not for BOD (404, like the module off). The gate first. */
export default async function MissionsPage() {
  const context = await requireActionPage("misi", mainWamPath.missions);
  const { settings, ...view } = await loadMisi(context, new Date());
  void settings;
  return <MisiScreen view={view} />;
}

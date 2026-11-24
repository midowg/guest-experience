import { notFound, redirect } from "next/navigation";
import { MissionCamera } from "@/components/main-wam/misi/MissionCamera";
import { MissionCheckIn } from "@/components/main-wam/misi/MissionCheckIn";
import { canStart } from "@/lib/main-wam/misi/missions";
import { sampleTagCandidates } from "@/lib/main-wam/misi/tag-sample";
import { tagRuleOf } from "@/lib/main-wam/misi/rules";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { loadMisi } from "@/lib/server/main-wam/misi/read";
import { loadTagPool } from "@/lib/server/main-wam/misi/tags";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kerjakan misi · WAM", robots: { index: false } };

/**
 * Kerjakan misi: the camera of a photo mission or the check-in of a place mission. A session mission is
 * done at its session, so this sends the person there (or back to Misi); one already done, waiting, or
 * not open goes back to Misi too. Module Misi; not for BOD. The gate first.
 */
export default async function DoMissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireActionPage("misi", mainWamPath.missionDo(id));
  const { settings, ...view } = await loadMisi(context, new Date());
  void settings;
  const item = view.items.find(candidate => candidate.id === id);
  if (!item) notFound();
  if (item.kind === "sesi") redirect(item.sessionId ? mainWamPath.session(item.sessionId) : mainWamPath.missions);
  if (!canStart(item)) redirect(mainWamPath.missions);
  if (item.kind !== "foto") return <MissionCheckIn item={item} demo={view.sample} />;
  // The people to tag are listed only for a mission that asks to tag (a name list costs a few queries).
  const candidates = !tagRuleOf(item.rules) ? [] : view.sample ? sampleTagCandidates(context.viewer.id) : [...(await loadTagPool(context)).values()];
  return <MissionCamera item={item} demo={view.sample} candidates={candidates} viewer={{ id: context.viewer.id, department: context.viewer.department }} />;
}

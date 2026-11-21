import { RankScreen } from "@/components/main-wam/misi/RankScreen";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { loadLeaderboard } from "@/lib/server/main-wam/misi/read";

export const dynamic = "force-dynamic";
export const metadata = { title: "Peringkat · WAM", robots: { index: false } };

/** Peringkat: everyone of the event by points (nama panggilan, department's short form, points). Module Misi; not for BOD. */
export default async function RankPage() {
  const context = await requireActionPage("misi", mainWamPath.missionRank);
  const board = await loadLeaderboard(context);
  return <RankScreen migrated={board.migrated} open={board.open} rows={board.rows} />;
}

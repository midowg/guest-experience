import { Moderation } from "@/components/main-wam/panitia/Moderation";
import { mainWamPath } from "@/lib/routes";
import { requireActionPage } from "@/lib/server/main-wam/gate";
import { moderationData } from "@/lib/server/main-wam/panitia/moderation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Moderasi Momen · WAM", robots: { index: false } };

/** K08 Moderasi Momen: Dilaporkan or Disembunyikan. Panitia and Admin WAM only. */
export default async function ModerasiPage({ searchParams }: { searchParams: Promise<{ lihat?: string }> }) {
  const { lihat } = await searchParams;
  const tab = lihat === "disembunyikan" ? "disembunyikan" : "dilaporkan";
  const context = await requireActionPage("kelola", mainWamPath.moderation(tab));
  const data = await moderationData(new Date(), context.viewer);
  return <Moderation {...data} tab={tab} />;
}

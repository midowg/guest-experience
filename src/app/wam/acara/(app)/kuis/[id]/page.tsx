import { notFound } from "next/navigation";
import { KuisWaiting } from "@/components/main-wam/kuis/KuisWaiting";
import { PlayScreen } from "@/components/main-wam/kuis/PlayScreen";
import { mainWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { requireModulePage } from "@/lib/server/main-wam/gate";
import { playState } from "@/lib/server/main-wam/kuis/play";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kuis live · WAM", robots: { index: false } };

/**
 * Kuis live, a player's game (rancangan §4, §4a): module kuis, everyone who may see Main WAM (BOD too).
 * The first state is drawn here; the phone keeps it fresh (polling, the server's clock).
 */
export default async function KuisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireModulePage("kuis", mainWamPath.quiz(id));
  const initial = await playState(context, id, null).catch((problem: unknown) => {
    if (problem instanceof ServiceError && (problem.status === 503 || problem.status === 404)) return problem.status;
    throw problem;
  });
  if (initial === 404) notFound();
  if (initial === 503) return <KuisWaiting />;
  return <PlayScreen quizId={id} initial={initial} />;
}

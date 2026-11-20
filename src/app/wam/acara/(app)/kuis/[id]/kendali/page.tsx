import { notFound } from "next/navigation";
import { ControlScreen } from "@/components/main-wam/kuis/ControlScreen";
import { KuisWaiting } from "@/components/main-wam/kuis/KuisWaiting";
import { mainWamPath } from "@/lib/routes";
import { ServiceError } from "@/lib/server/config";
import { requireModulePage } from "@/lib/server/main-wam/gate";
import { controlState } from "@/lib/server/main-wam/kuis/control";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kendali kuis · WAM", robots: { index: false } };

/**
 * Kuis live, the MC's control (rancangan §7): module kuis, then only for a pengendali chosen for this
 * quiz in Admin WAM, or Admin WAM (the role); for anyone else it does not exist (404).
 */
export default async function KuisControlPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireModulePage("kuis", mainWamPath.quizControl(id));
  const initial = await controlState(context, id).catch((problem: unknown) => {
    if (problem instanceof ServiceError && (problem.status === 503 || problem.status === 404)) return problem.status;
    throw problem;
  });
  if (initial === 404) notFound();
  if (initial === 503) return <KuisWaiting />;
  return <ControlScreen quizId={id} initial={initial} />;
}

import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { SessionSheetServer } from "@/components/main-wam/peserta/agenda/SessionSheetServer";

export const dynamic = "force-dynamic";

/**
 * Detail sesi opened from inside the app (a session row, a Beranda card or slide, a notification in the list): the
 * address is intercepted, so the screen the person is on stays exactly as it is and only the sheet opens over it
 * (its loading.tsx is the sheet's own skeleton, never a skeleton of the screen). A link or a reload of the same
 * address is the page in (app)/agenda/[id] instead. Owner A (peserta).
 */
export default async function InterceptedSession({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireMainWamPage(mainWamPath.session(id));
  return <SessionSheetServer id={id} context={context} />;
}

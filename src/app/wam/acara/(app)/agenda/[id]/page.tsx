import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { SessionSheetServer } from "@/components/main-wam/peserta/agenda/SessionSheetServer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Detail sesi · WAM", robots: { index: false } };

/**
 * P04 Detail sesi, a bottom sheet over Agenda, opened directly (a notification, a link, a reload). Opened from
 * inside the app the same address is intercepted by the @sheet slot (the screen the person is on stays; see
 * (app)/@sheet/(.)agenda/[id]). Owner A (peserta): the gate first; drafts and unknown ids are not found. Behind the
 * sheet is Agenda of the session's own day (a day of the event, or a Persiapan day "H-3"); the sheet closes back to it.
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireMainWamPage(mainWamPath.session(id));
  return <SessionSheetServer id={id} context={context} behind />;
}

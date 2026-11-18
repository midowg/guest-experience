import { notFound } from "next/navigation";
import { SessionScreen } from "@/components/main-wam/peserta/agenda/SessionScreen";
import { denahHrefOf } from "@/lib/main-wam/peserta/guides";
import { SessionAbsen, SessionModuleAction } from "@/components/main-wam/modul/SessionModule";
import { SessionPhotos } from "@/components/main-wam/momen/SessionPhotos";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { loadSession } from "@/lib/server/main-wam/peserta/agenda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Detail sesi · WAM", robots: { index: false } };

/**
 * P04 Detail sesi. Owner A (peserta): the gate first; drafts and unknown ids are not found. Agen D's
 * SessionAbsen and SessionModuleAction and agen B's SessionPhotos come in as slots.
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireMainWamPage(mainWamPath.session(id));
  const now = new Date();
  const data = await loadSession(context, id, now);
  if (!data) notFound();
  return <SessionScreen view={data.view} contact={data.contact} denahHref={denahHrefOf(data.denah)} slots={{
    absen: <SessionAbsen session={data.session} context={context} now={now} />,
    action: <SessionModuleAction session={data.session} context={context} now={now} />,
    photos: <SessionPhotos session={data.session} context={context} />,
  }} />;
}

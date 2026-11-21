import { notFound } from "next/navigation";
import { AgendaScreen } from "@/components/main-wam/peserta/agenda/AgendaScreen";
import { SessionSheet } from "@/components/main-wam/peserta/agenda/SessionSheet";
import { denahHrefOf } from "@/lib/main-wam/peserta/guides";
import { hhmm } from "@/lib/main-wam/peserta/format";
import { SessionAbsen, SessionModuleAction } from "@/components/main-wam/modul/SessionModule";
import { SessionPhotos } from "@/components/main-wam/momen/SessionPhotos";
import { mainWamPath } from "@/lib/routes";
import { requireMainWamPage } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { loadAgenda, loadSession, tabOfSession } from "@/lib/server/main-wam/peserta/agenda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Detail sesi · WAM", robots: { index: false } };

/**
 * P04 Detail sesi, a bottom sheet over Agenda. Owner A (peserta): the gate first; drafts and unknown ids
 * are not found. Behind the sheet is Agenda of the session's own day (a day of the event, or a Persiapan
 * day "H-3"); the sheet closes back to it. Agen D's SessionAbsen and SessionModuleAction and agen B's
 * SessionPhotos come in as slots, the checklist (module Ceklis) as data.
 */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireMainWamPage(mainWamPath.session(id));
  const now = new Date();
  const data = await loadSession(context, id, now);
  if (!data) notFound();
  const tab = tabOfSession(data.session, context);
  const agenda = await loadAgenda(context, tab, now);
  const closeHref = tab?.startsWith("h") ? mainWamPath.agendaPrep(Number(tab.slice(1))) : mainWamPath.agenda(tab ? Number(tab) : undefined);
  return <>
    <AgendaScreen {...agenda} since={hhmm(now.toISOString(), await readLang())} />
    <SessionSheet view={data.view} contact={data.contact} denahHref={denahHrefOf(data.denah)} closeHref={closeHref}
      checklist={data.checklist ? { sessionId: data.session.id, items: data.checklist.items, required: data.checklist.required, sample: data.checklist.sample } : null}
      slots={{
        absen: <SessionAbsen session={data.session} context={context} now={now} />,
        action: <SessionModuleAction session={data.session} context={context} now={now} />,
        photos: <SessionPhotos session={data.session} context={context} />,
      }} />
  </>;
}

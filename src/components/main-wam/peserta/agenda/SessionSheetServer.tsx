import { notFound } from "next/navigation";
import { AgendaScreen } from "./AgendaScreen";
import { SessionSheet } from "./SessionSheet";
import { denahHrefOf } from "@/lib/main-wam/peserta/guides";
import { hhmm } from "@/lib/main-wam/peserta/format";
import { SessionAbsen, SessionModuleAction } from "@/components/main-wam/modul/SessionModule";
import { SessionPhotos } from "@/components/main-wam/momen/SessionPhotos";
import { mainWamPath } from "@/lib/routes";
import type { MainWamContext } from "@/lib/server/main-wam/gate";
import { readLang } from "@/lib/server/main-wam/lang";
import { loadAgenda, loadSession, tabOfSession } from "@/lib/server/main-wam/peserta/agenda";

/**
 * Detail sesi on the server (P04): the gate first, then the session; drafts and unknown ids are not found. Used by
 * both ways in: the page of its own address (a link, a notification, a reload: `behind`, Agenda of the session's day
 * drawn under the sheet) and the intercepted route inside another screen (Beranda, Agenda, ...: only the sheet, the
 * screen behind stays as it is). Agen D's SessionAbsen and SessionModuleAction and agen B's SessionPhotos come in as
 * slots, the checklist (module Ceklis) as data. Owner A (peserta).
 */
export async function SessionSheetServer({ id, context, behind = false }: { id: string; /** From the page's own gate (requireMainWamPage(mainWamPath.session(id))). */ context: MainWamContext; behind?: boolean }) {
  const now = new Date();
  const data = await loadSession(context, id, now);
  if (!data) notFound();
  const tab = tabOfSession(data.session, context);
  const closeHref = tab?.startsWith("h") ? mainWamPath.agendaPrep(Number(tab.slice(1))) : mainWamPath.agenda(tab ? Number(tab) : undefined);
  const agenda = behind ? await loadAgenda(context, tab, now) : null;
  return <>
    {agenda && <AgendaScreen {...agenda} since={hhmm(now.toISOString(), await readLang())} />}
    <SessionSheet view={data.view} contact={data.contact} denahHref={denahHrefOf(data.denah)} closeHref={closeHref}
      checklist={data.checklist ? { sessionId: data.session.id, items: data.checklist.items, sample: data.checklist.sample } : null}
      slots={{
        absen: <SessionAbsen session={data.session} context={context} now={now} />,
        action: <SessionModuleAction session={data.session} context={context} now={now} />,
        photos: <SessionPhotos session={data.session} context={context} />,
      }} />
  </>;
}

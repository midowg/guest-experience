import "server-only";
import { visibleSessions } from "@/lib/main-wam/ceklis/ceklis";
import { agendaDays, agendaRowsOfTab, shownTab, tabOfDate, type AgendaDayTab, type AgendaRow } from "@/lib/main-wam/peserta/agenda";
import type { Contact } from "@/lib/main-wam/peserta/contact";
import { denahFor } from "@/lib/main-wam/peserta/guides";
import { sessionView, type SessionView } from "@/lib/main-wam/peserta/session";
import { prepDatesOf, wibDate } from "@/lib/main-wam/rundown";
import type { MwSession, RundownChange } from "@/lib/main-wam/types";
import { listGuides, rundownLog, sessionById, shownSessions } from "../read";
import type { MainWamContext } from "../gate";
import { t } from "@/lib/main-wam/i18n";
import { checklistView, myChecks, readChecklists } from "../ceklis/data";
import { readLang } from "../lang";
import { contactOf } from "./contacts";

/*
 * Agenda (P03) and Detail sesi (P04), for the pages and GET mainWamApi.agenda / session(id).
 * Participants never see drafts; cancelled sessions show struck through. The change log is read
 * once for the whole rundown (it is small, and indexed by time). Module Ceklis (agen S1): the
 * Persiapan tabs ("H-3"), the checklist chips of the rows, and the checklist of an agenda; with the
 * module off none of it exists (a Persiapan agenda is not found).
 */

/** `day`: 1–4, or 0 on a Persiapan tab; `tab` is the tab's key ("2", "h3"). */
export type AgendaData = { migrated: boolean; days: AgendaDayTab[]; day: number; tab: string; rows: AgendaRow[]; anyPublished: boolean };

const log = (sessionId?: string) => rundownLog(sessionId, 500).then(read => read.data).catch(() => [] as RundownChange[]);

export async function loadAgenda({ viewer, settings }: MainWamContext, asked: string | string[] | undefined, now: Date): Promise<AgendaData> {
  const ceklisOn = settings.modules.ceklis;
  const [read, changes, lang, lists, checked] = await Promise.all([
    shownSessions(), log(), readLang(),
    ceklisOn ? readChecklists().then(result => result.data).catch(() => null) : null,
    ceklisOn ? myChecks(viewer.id).catch(() => null) : null,
  ]);
  const sessions = visibleSessions(read.data, settings.event, ceklisOn);
  const prepDates = ceklisOn ? prepDatesOf(sessions.filter(session => session.status !== "draf"), settings.event) : [];
  const tab = shownTab(asked, now, settings.event, prepDates);
  return {
    migrated: read.migrated,
    days: agendaDays(settings.event, wibDate(now.toISOString()), lang, prepDates),
    day: /^\d+$/.test(tab) ? Number(tab) : 0,
    tab,
    rows: agendaRowsOfTab(sessions, tab, settings.event, now, changes, lang, lists && checked ? { lists, checked } : undefined),
    anyPublished: sessions.some(session => session.status === "terbit"),
  };
}

/** The tab (key) Agenda opens on for a session: behind the Detail sheet, the agenda of that session's own day. */
export const tabOfSession = (session: Pick<MwSession, "startsAt">, context: MainWamContext): string | undefined => tabOfDate(wibDate(session.startsAt), context.settings.event);

export type SessionChecklistData = NonNullable<ReturnType<typeof checklistView>>;
export type SessionData = { session: MwSession; view: SessionView; contact: Contact | null; denah: { slug: string } | null; checklist: SessionChecklistData | null };

/** One session for a participant; null when there is none or it is a draft (the page is then not found). */
export async function loadSession(context: MainWamContext, id: string, now: Date): Promise<SessionData | null> {
  const session = await sessionById(id);
  if (!session || session.status === "draf") return null;
  const ceklisOn = context.settings.modules.ceklis;
  // Module Ceklis off: a Persiapan agenda (before the first day) does not exist for participants.
  if (visibleSessions([session], context.settings.event, ceklisOn).length === 0) return null;
  const lang = await readLang();
  const [changes, contact, guides, lists, checked] = await Promise.all([
    log(session.id),
    contactOf(session.contactId, t(lang, "peserta.contact.committee")).catch(() => null),
    listGuides().then(read => read.data).catch(() => []),
    ceklisOn ? readChecklists().then(result => result.data).catch(() => null) : null,
    ceklisOn ? myChecks(context.viewer.id).catch(() => new Set<string>()) : null,
  ]);
  const denah = denahFor(session, guides);
  return {
    session, view: sessionView(session, now, changes, !!contact, lang), contact, denah: denah ? { slug: denah.slug } : null,
    checklist: lists && checked ? checklistView(lists.get(session.id), checked) : null,
  };
}

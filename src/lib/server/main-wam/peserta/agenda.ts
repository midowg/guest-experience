import "server-only";
import { agendaDays, agendaRows, shownDay, type AgendaDayTab, type AgendaRow } from "@/lib/main-wam/peserta/agenda";
import type { Contact } from "@/lib/main-wam/peserta/contact";
import { denahFor } from "@/lib/main-wam/peserta/guides";
import { sessionView, type SessionView } from "@/lib/main-wam/peserta/session";
import { wibDate } from "@/lib/main-wam/rundown";
import type { MwSession, RundownChange } from "@/lib/main-wam/types";
import { listGuides, rundownLog, sessionById, shownSessions } from "../read";
import type { MainWamContext } from "../gate";
import { t } from "@/lib/main-wam/i18n";
import { readLang } from "../lang";
import { contactOf } from "./contacts";

/*
 * Agenda (P03) and Detail sesi (P04), for the pages and GET mainWamApi.agenda / session(id).
 * Participants never see drafts; cancelled sessions show struck through. The change log is read
 * once for the whole rundown (it is small, and indexed by time).
 */

export type AgendaData = { migrated: boolean; days: AgendaDayTab[]; day: number; rows: AgendaRow[]; anyPublished: boolean };

const log = (sessionId?: string) => rundownLog(sessionId, 500).then(read => read.data).catch(() => [] as RundownChange[]);

export async function loadAgenda({ settings }: MainWamContext, asked: string | string[] | undefined, now: Date): Promise<AgendaData> {
  const [sessions, changes, lang] = await Promise.all([shownSessions(), log(), readLang()]);
  const day = shownDay(asked, now, settings.event);
  return {
    migrated: sessions.migrated,
    days: agendaDays(settings.event, wibDate(now.toISOString()), lang),
    day,
    rows: agendaRows(sessions.data, day, settings.event, now, changes, lang),
    anyPublished: sessions.data.some(session => session.status === "terbit"),
  };
}

export type SessionData = { session: MwSession; view: SessionView; contact: Contact | null; denah: { slug: string } | null };

/** One session for a participant; null when there is none or it is a draft (the page is then not found). */
export async function loadSession(_context: MainWamContext, id: string, now: Date): Promise<SessionData | null> {
  const session = await sessionById(id);
  if (!session || session.status === "draf") return null;
  const lang = await readLang();
  const [changes, contact, guides] = await Promise.all([
    log(session.id),
    contactOf(session.contactId, t(lang, "peserta.contact.committee")).catch(() => null),
    listGuides().then(read => read.data).catch(() => []),
  ]);
  const denah = denahFor(session, guides);
  return { session, view: sessionView(session, now, changes, !!contact, lang), contact, denah: denah ? { slug: denah.slug } : null };
}

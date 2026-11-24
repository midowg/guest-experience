import "server-only";
import { mainWamCan } from "@/lib/main-wam/access";
import {
  announcementCandidates, homeCardView, homeSlides, nextChangeAt, nowView, pickCard, silentCandidates, surveyCandidate, travelCandidate, votingCandidates,
  type HomeCandidate, type HomeData,
} from "@/lib/main-wam/peserta/home";
import { checklistProgress, visibleSessions } from "@/lib/main-wam/ceklis/ceklis";
import { wibDate } from "@/lib/main-wam/rundown";
import type { MwSession } from "@/lib/main-wam/types";
import { myChecks, readChecklists } from "../ceklis/data";
import { pinnedForMe } from "../notes";
import { attendanceOf, awardCategories, listTrips, seatsOf, shownSessions, silentQuestions, votedCategories } from "../read";
import type { MainWamContext } from "../gate";
import { readLang } from "../lang";
import { surveyFor } from "../survey";

/*
 * Beranda's data (P01/P02), for the page and GET mainWamApi.home: the Sekarang card and the one
 * contextual card, from fondasi's readers. Each part reads only what it can show: the module is
 * on and the role takes part (BOD do not check in, send Silent Meeting or vote), and the trips only
 * on the first and last day. A part that fails is left out; the page still shows the rest.
 */

export type { HomeData };

const none = <T>(value: T) => () => value;

/** The Sekarang card's agenda has a checklist this person has not finished: how far they are. A read that fails says nothing. */
async function unfinishedChecklist(sessionId: string, employeeId: string): Promise<{ done: number; total: number } | null> {
  try {
    const [lists, checked] = await Promise.all([readChecklists(), myChecks(employeeId)]);
    const items = lists.data.get(sessionId)?.items ?? [];
    const progress = checklistProgress(items, checked);
    return progress.total > 0 && !progress.complete ? { done: progress.done, total: progress.total } : null;
  } catch { return null; }
}

export async function loadHome(context: MainWamContext, now: Date): Promise<HomeData> {
  const { viewer, settings } = context;
  const lang = await readLang();
  const modules = settings.modules;
  const absenOn = modules.absen && mainWamCan(viewer, "absen");
  const today = wibDate(now.toISOString());
  const travelDay = today === settings.event.startDate || today === settings.event.endDate;

  const [sessionsRead, attendance, pinned, questions, categories, voted, trips, seats] = await Promise.all([
    shownSessions().then(read => ({ ...read, failed: false })).catch(() => ({ data: [] as MwSession[], migrated: true, failed: true })),
    absenOn ? attendanceOf({ employeeId: viewer.id }).then(read => read.data).catch(none([])) : Promise.resolve([]),
    pinnedForMe(viewer.id, now).catch(none([])),
    modules.silent && mainWamCan(viewer, "silent-kirim") ? silentQuestions().then(read => read.data).catch(none([])) : Promise.resolve([]),
    modules.voting && mainWamCan(viewer, "voting") ? awardCategories().then(read => read.data).catch(none([])) : Promise.resolve([]),
    modules.voting && mainWamCan(viewer, "voting") ? votedCategories(viewer.id).then(read => read.data).catch(none(new Set<string>())) : Promise.resolve(new Set<string>()),
    travelDay ? listTrips().then(read => read.data).catch(none([])) : Promise.resolve([]),
    travelDay ? seatsOf(viewer.id).then(read => read.data).catch(none([])) : Promise.resolve([]),
  ]);
  // Module Ceklis off: the Persiapan agendas (before the first day) do not exist for participants.
  const sessions = visibleSessions(sessionsRead.data, settings.event, modules.ceklis);
  const checkedIn = new Map(attendance.map(row => [row.sessionId, row.checkedInAt]));
  const view = nowView({ sessions, now, event: settings.event, absenOn, checkedIn, lang });
  // Survei reads the questionnaire only once its session has started (surveyFor, audit R7).
  const survey = await surveyFor(context, sessions, now).catch(() => null);
  const session = view.kind === "sesi" ? sessions.find(item => item.id === view.sessionId) ?? null : null;
  const ceklis = session && modules.ceklis ? await unfinishedChecklist(session.id, viewer.id) : null;

  const candidates: HomeCandidate[] = [
    ...announcementCandidates(pinned, now),
    ...silentCandidates(questions, sessions, now),
    ...votingCandidates(categories, voted, now),
    ...[travelCandidate(trips, seats, now, lang), surveyCandidate(survey, lang)].filter((card): card is HomeCandidate => !!card),
  ];
  const picked = pickCard(candidates, modules, now);
  const refreshAt = nextChangeAt(sessions, now, [...pinned.map(note => note.pinnedUntil), ...candidates.map(card => card.until)]);
  return { migrated: sessionsRead.migrated && settings.migrated, now: view, slides: homeSlides(sessions, now, view, lang), session, card: picked ? homeCardView(picked, now, lang) : null, refreshAt, serverNow: now.toISOString(), failed: sessionsRead.failed, ceklis };
}

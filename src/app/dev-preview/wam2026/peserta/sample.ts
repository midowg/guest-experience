import { mainWamCan } from "@/lib/main-wam/access";
import type { Lang } from "@/lib/main-wam/i18n";
import {
  announcementCandidates, homeCardView, homeSlides, nextChangeAt, nowView, pickCard, silentCandidates, surveyCandidate, travelCandidate, votingCandidates,
  type HomeCandidate, type HomeData,
} from "@/lib/main-wam/peserta/home";
import { eventEndsAt, surveyOpen, surveyStarted, type SurveyForm } from "@/lib/main-wam/peserta/survey";
import { wibDate } from "@/lib/main-wam/rundown";
import {
  sampleAttendance, sampleAwards, sampleNotifications, sampleSeats, sampleSessionIds, sampleSessions, sampleSessionsChanged, sampleSettings,
  sampleSilentQuestion, sampleTime, sampleTimes, sampleTrips, sampleViewer, samplePeople,
} from "@/lib/main-wam/sample";
import type { MainWamSettings, MainWamViewer, MwNotification, MwSession, RundownChange } from "@/lib/main-wam/types";

/*
 * Agen A's preview data (dev-preview only, never in the app): fondasi's sample.ts at a moment in
 * time, so every screen shows what it would at that moment. ?waktu= is a key of sampleTimes
 * (berangkat, pagi, pemaparan, panitia, silent, teamBuilding, bod); ?hari=1–4 with ?jam=07:10 picks
 * any other moment. Nothing that has not happened yet at that moment shows (check-ins, notes,
 * the 10.20 change).
 */

const DAYS = ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07"];

/** The preview's moment. */
export function previewTime(params: { waktu?: string; hari?: string; jam?: string }): Date {
  const day = Number(params.hari);
  if (params.jam && /^\d{2}:\d{2}$/.test(params.jam)) return new Date(`${DAYS[(day >= 1 && day <= 4 ? day : 2) - 1]}T${params.jam}:00+07:00`);
  return params.waktu && params.waktu in sampleTimes ? sampleTime(params.waktu) : sampleTime("pagi");
}

const at = (date: string, time: string) => `${date}T${time}:00+07:00`;
const CHANGE_AT = at(DAYS[1], "10:20");

/** The rundown as it stands at `now`: from Sel 10.20 on, panitia's change (Pemaparan to 12.30, …). */
export function previewSessions(now: Date): MwSession[] {
  return now.getTime() >= Date.parse(CHANGE_AT) ? sampleSessionsChanged() : sampleSessions;
}

/** Rundown live's log of the 10.20 change, each moved session with its old hours. */
export function previewLog(now: Date): RundownChange[] {
  if (now.getTime() < Date.parse(CHANGE_AT)) return [];
  const entry = (n: number, key: string, changes: RundownChange["changes"]): RundownChange => ({
    id: `00000000-0000-4000-8099-00000000000${n}`, sessionId: sampleSessionIds[key], changes, notified: true, recipients: 122, changedBy: samplePeople.dimas.id, changedAt: CHANGE_AT,
  });
  return [
    entry(1, "pemaparan", [{ field: "endsAt", from: at(DAYS[1], "12:00"), to: at(DAYS[1], "12:30") }]),
    entry(2, "makan-siang-2", [{ field: "startsAt", from: at(DAYS[1], "12:00"), to: at(DAYS[1], "12:30") }, { field: "endsAt", from: at(DAYS[1], "13:00"), to: at(DAYS[1], "13:30") }]),
    entry(3, "silent", [{ field: "startsAt", from: at(DAYS[1], "13:00"), to: at(DAYS[1], "13:30") }, { field: "endsAt", from: at(DAYS[1], "14:30"), to: at(DAYS[1], "15:00") }]),
  ];
}

/** Notes sent by `now` (P01's pinned announcement "Ke Aula Utama lewat lobby timur" until noon). */
export function previewNotifications(now: Date, readAll = false): MwNotification[] {
  const notes = sampleNotifications.map(note => note.id === sampleNotifications[4].id
    ? { ...note, title: "Ke Aula Utama lewat lobby timur", pinnedUntil: at(DAYS[1], "12:00") } : note);
  const extra: MwNotification[] = [
    { id: "00000000-0000-4000-8009-000000000007", kind: "lain", title: "Kumpul di Stasiun Tugu", body: "Kumpul 05.30 di pintu selatan. Bawa KTP.", createdAt: at(DAYS[0], "04:30"), readAt: at(DAYS[0], "04:40"), link: null, pinnedUntil: null, fromPraWam: false },
  ];
  return [...notes, ...extra].filter(note => Date.parse(note.createdAt) <= now.getTime())
    .map(note => (readAll ? { ...note, readAt: note.readAt ?? now.toISOString() } : note));
}

export type PreviewCard = "pengumuman" | "silent" | "voting" | "berangkat" | "survei" | "tanpa";

/** Beranda at `now` for `viewer`, built by the same functions as the server's loadHome. */
/** The sample questionnaire behind module survei: open, 5 minutes, answers until Kam 12.00 (P01__status "sampai 12.00"). */
export const previewSurveyForm: SurveyForm = { slug: "survei-wam", status: "buka", editUntil: at(DAYS[3], "12:00"), minutes: 5 };

/**
 * Beranda at `now` for `viewer`, built by the same functions as the server's loadHome. `surveyDone`:
 * the person already sent the survey (its card is gone).
 */
export function previewHome(now: Date, viewer: MainWamViewer, settings: MainWamSettings = sampleSettings(), force?: PreviewCard | null, surveyDone = false, lang: Lang = "id", qr?: boolean): HomeData {
  const sessions = previewSessions(now);
  const absenOn = settings.modules.absen && mainWamCan(viewer, "absen");
  const checkedIn = new Map(sampleAttendance.filter(row => row.employeeId === viewer.id && Date.parse(row.checkedInAt) <= now.getTime()).map(row => [row.sessionId, row.checkedInAt]));
  const view = nowView({ sessions, now, event: settings.event, absenOn, checkedIn, lang, ...(qr === undefined ? {} : { qr }) });
  const pinned = previewNotifications(now);
  const candidates: HomeCandidate[] = [
    ...announcementCandidates(pinned, now),
    ...(mainWamCan(viewer, "silent-kirim") ? silentCandidates([sampleSilentQuestion], sessions, now) : []),
    ...(mainWamCan(viewer, "voting") ? votingCandidates(sampleAwards, new Set(), now) : []),
    ...[travelCandidate(sampleTrips, sampleSeats.filter(seat => seat.employeeId === viewer.id), now, lang), surveyCandidate(previewSurvey(settings, sessions, now, surveyDone), lang)].filter((card): card is HomeCandidate => !!card),
  ];
  const forced = force === "tanpa" ? null : force ? candidates.find(card => card.kind === force) ?? null : undefined;
  const picked = forced !== undefined ? forced : pickCard(candidates, settings.modules, now);
  return {
    migrated: true, now: view, slides: homeSlides(sessions, now, view, lang), session: view.kind === "sesi" ? sessions.find(item => item.id === view.sessionId) ?? null : null,
    card: picked ? homeCardView(picked, now, lang) : null, refreshAt: nextChangeAt(sessions, now), serverNow: now.toISOString(), failed: false,
  };
}

/** The survey as surveyFor decides it, with the sample questionnaire (`done`: already sent). */
export function previewSurvey(settings: MainWamSettings, sessions: readonly MwSession[], now: Date, done = false, sessionId?: string) {
  const start = surveyStarted({ formSlug: settings.moduleConfig.survei.formSlug, moduleOn: settings.modules.survei, sessions, now, eventEnd: eventEndsAt(settings.event.endDate), sessionId });
  return surveyOpen(start, { form: previewSurveyForm, done, now });
}

export const previewViewer = (peran?: string) => sampleViewer(peran);
export const todayOf = (now: Date) => wibDate(now.toISOString());
